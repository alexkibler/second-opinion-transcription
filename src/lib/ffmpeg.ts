import ffmpeg from 'fluent-ffmpeg'
import { promisify } from 'util'
import { unlink } from 'fs/promises'
import path from 'path'

export interface AudioSegmentParams {
  inputPath: string
  outputPath: string
  startTime: number // in seconds
  duration: number // in seconds
}

export class FFmpegService {
  /**
   * Extract a precise audio segment from a file
   * Uses accurate seeking and re-encoding to ensure exact timestamps
   */
  async extractSegment(params: AudioSegmentParams): Promise<string> {
    const { inputPath, outputPath, startTime, duration } = params

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .audioChannels(1) // Mono
        .audioFrequency(16000) // 16kHz sampling rate (optimal for Qwen2-Audio)
        .audioCodec('pcm_s16le') // Uncompressed WAV
        .format('wav')
        .output(outputPath)
        .on('end', () => {
          console.log(`✓ Audio segment extracted: ${outputPath}`)
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('FFmpeg extraction error:', err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * Get audio file duration
   */
  async getDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err)
          return
        }
        const duration = metadata.format.duration || 0
        resolve(duration)
      })
    })
  }

  /**
   * Create a temporary file path for audio segments
   */
  createTempPath(basePath: string, start: number, end: number): string {
    const timestamp = Date.now()
    const filename = `segment_${start.toFixed(2)}_${end.toFixed(2)}_${timestamp}.wav`
    return path.join(path.dirname(basePath), filename)
  }

  /**
   * Clean up temporary audio file
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
      console.log(`✓ Cleaned up temporary file: ${filePath}`)
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  }
}

export const ffmpegService = new FFmpegService()
