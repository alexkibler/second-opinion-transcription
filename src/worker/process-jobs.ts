#!/usr/bin/env node

/**
 * CAHTS Background Worker
 *
 * This worker process monitors the SQLite database for PENDING jobs and processes them
 * through the complete transcription pipeline:
 * 1. Whisper initial transcription with confidence scores
 * 2. Cluster low-confidence words
 * 3. Extract audio segments via FFmpeg
 * 4. Qwen2-Audio correction
 * 5. Reconcile and merge transcripts
 * 6. Send Discord notifications
 */

import { prisma, enableWALMode } from '../lib/db'
import { whisperService } from '../lib/whisper'
import { qwenService } from '../lib/qwen'
import { ffmpegService } from '../lib/ffmpeg'
import { clusteringService } from '../lib/clustering'
import { reconciliationService } from '../lib/reconciliation'
import { discordService } from '../lib/discord'

const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '3000')

class TranscriptionWorker {
  private isProcessing = false
  private shouldStop = false

  async start() {
    console.log('🚀 CAHTS Worker started')
    console.log(`   Polling interval: ${POLL_INTERVAL}ms`)

    // Enable WAL mode for better concurrency
    await enableWALMode()

    // Set up graceful shutdown
    process.on('SIGINT', () => this.shutdown())
    process.on('SIGTERM', () => this.shutdown())

    // Start polling loop
    await this.pollLoop()
  }

  async shutdown() {
    console.log('\n⏹️  Shutting down worker...')
    this.shouldStop = true

    // Wait for current job to finish
    while (this.isProcessing) {
      await this.sleep(100)
    }

    await prisma.$disconnect()
    console.log('✓ Worker shut down gracefully')
    process.exit(0)
  }

  async pollLoop() {
    while (!this.shouldStop) {
      try {
        await this.processNextJob()
      } catch (error) {
        console.error('Poll loop error:', error)
      }

      // Wait before next poll
      await this.sleep(POLL_INTERVAL)
    }
  }

  async processNextJob() {
    if (this.isProcessing) return

    // Atomic job claiming: find PENDING job and immediately mark as PROCESSING
    const job = await prisma.$transaction(async (tx) => {
      const pendingJob = await tx.job.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              discordWebhookUrl: true,
            },
          },
        },
      })

      if (!pendingJob) return null

      // Atomically claim the job
      return tx.job.update({
        where: { id: pendingJob.id },
        data: {
          status: 'PROCESSING',
          processingStarted: new Date(),
        },
        include: {
          user: {
            select: {
              discordWebhookUrl: true,
            },
          },
        },
      })
    })

    if (!job) return

    this.isProcessing = true
    console.log(`\n📝 Processing job: ${job.id}`)
    console.log(`   File: ${job.originalFileName}`)

    try {
      // Send Discord notification (job started)
      const userWebhook = job.user.discordWebhookUrl
      await discordService.notifyJobStarted(job.id, job.originalFileName, userWebhook || undefined)

      // Step 1: Whisper transcription with confidence extraction
      console.log('   [1/6] Running Whisper transcription...')
      const whisperResponse = await whisperService.transcribe(job.originalAudioPath)
      const words = whisperService.extractWords(whisperResponse)
      console.log(`   ✓ Transcribed ${words.length} words`)

      // Save segments to database
      await prisma.segment.createMany({
        data: words.map(word => ({
          jobId: job.id,
          word: word.word,
          start: word.start,
          end: word.end,
          confidence: word.probability,
        })),
      })

      // Step 2: Cluster low-confidence words
      console.log('   [2/6] Analyzing confidence scores...')
      const clusters = clusteringService.clusterLowConfidenceWords(words)
      const stats = clusteringService.getClusteringStats(words, clusters)
      console.log(`   ✓ Found ${clusters.length} low-confidence clusters`)
      console.log(`      Low-confidence words: ${stats.lowConfidenceWords}/${stats.totalWords}`)

      // Step 3-5: Process each cluster
      const corrections: Array<{
        clipStart: number
        clipEnd: number
        correctedText: string
        shouldApply: boolean
      }> = []

      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i]
        console.log(`   [3/6] Processing cluster ${i + 1}/${clusters.length}...`)
        console.log(`      Time: ${cluster.clipStart.toFixed(2)}s - ${cluster.clipEnd.toFixed(2)}s`)

        try {
          // Extract audio segment via FFmpeg
          const clipPath = ffmpegService.createTempPath(
            job.originalAudioPath,
            cluster.clipStart,
            cluster.clipEnd
          )

          await ffmpegService.extractSegment({
            inputPath: job.originalAudioPath,
            outputPath: clipPath,
            startTime: cluster.clipStart,
            duration: cluster.clipEnd - cluster.clipStart,
          })

          // Qwen2-Audio correction
          console.log(`   [4/6] Running Qwen2-Audio correction...`)
          const correctedText = await qwenService.correctTranscription(clipPath)
          console.log(`      Correction: "${correctedText.substring(0, 50)}..."`)

          // Reconciliation
          console.log(`   [5/6] Reconciling correction...`)
          const reconciliation = reconciliationService.reconcile(
            words,
            correctedText,
            cluster.clipStart,
            cluster.clipEnd
          )

          console.log(`      Should apply: ${reconciliation.shouldApply}`)
          if (!reconciliation.shouldApply && reconciliation.reason) {
            console.log(`      Reason: ${reconciliation.reason}`)
          }

          corrections.push({
            clipStart: cluster.clipStart,
            clipEnd: cluster.clipEnd,
            correctedText: reconciliation.correctedText,
            shouldApply: reconciliation.shouldApply,
          })

          // Save correction to database
          const segmentInCluster = await prisma.segment.findFirst({
            where: {
              jobId: job.id,
              start: { gte: cluster.clipStart },
              end: { lte: cluster.clipEnd },
            },
          })

          if (segmentInCluster) {
            await prisma.correction.create({
              data: {
                segmentId: segmentInCluster.id,
                originalText: reconciliation.originalText,
                correctedText: reconciliation.correctedText,
                triggerConfidence: cluster.averageConfidence,
                audioClipPath: clipPath,
                clipStart: cluster.clipStart,
                clipEnd: cluster.clipEnd,
                levenshteinDistance: reconciliation.levenshteinDistance,
              },
            })
          }

          // Clean up temporary audio file
          await ffmpegService.cleanup(clipPath)
        } catch (clusterError) {
          console.error(`   ⚠️  Cluster processing error:`, clusterError)
          // Continue with next cluster
        }
      }

      // Step 6: Merge final transcript
      console.log('   [6/6] Merging final transcript...')
      const merged = reconciliationService.mergeTranscript(words, corrections)
      console.log(`   ✓ Applied ${merged.appliedCorrections} corrections`)
      console.log(`   ⊘ Skipped ${merged.skippedCorrections} corrections`)

      // Update job with final transcript
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          transcript: merged.text,
          processingEnded: new Date(),
        },
      })

      const processingTime = Date.now() - job.processingStarted!.getTime()
      console.log(`✅ Job completed in ${(processingTime / 1000).toFixed(2)}s`)

      // Send Discord notification (success)
      await discordService.notifyJobCompleted(
        job.id,
        job.originalFileName,
        processingTime,
        merged.appliedCorrections,
        userWebhook || undefined
      )
    } catch (error) {
      console.error('❌ Job processing error:', error)

      // Update job as failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          processingEnded: new Date(),
        },
      })

      // Send Discord notification (failure)
      const userWebhook = job.user.discordWebhookUrl
      await discordService.notifyJobFailed(
        job.id,
        job.originalFileName,
        error instanceof Error ? error.message : 'Unknown error',
        userWebhook || undefined
      )
    } finally {
      this.isProcessing = false
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Start worker
const worker = new TranscriptionWorker()
worker.start().catch(error => {
  console.error('Fatal worker error:', error)
  process.exit(1)
})
