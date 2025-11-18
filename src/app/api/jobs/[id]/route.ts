import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jobId = params.id

    // Fetch job with segments and corrections
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
        userId: user.id, // Ensure user can only access their own jobs
      },
      include: {
        segments: {
          orderBy: {
            start: 'asc',
          },
        },
        _count: {
          select: {
            segments: true,
          },
        },
      },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Calculate processing time if applicable
    let processingTime: number | null = null
    if (job.processingStarted && job.processingEnded) {
      processingTime = job.processingEnded.getTime() - job.processingStarted.getTime()
    }

    // Return job data
    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        originalFileName: job.originalFileName,
        transcript: job.transcript,
        processingTime,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        segmentCount: job._count.segments,
      },
    })
  } catch (error) {
    console.error('Get job error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    )
  }
}
