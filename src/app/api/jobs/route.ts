import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where clause
    const where: any = {
      userId: user.id,
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    // Fetch jobs
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          originalFileName: true,
          createdAt: true,
          updatedAt: true,
          processingStarted: true,
          processingEnded: true,
        },
      }),
      prisma.job.count({ where }),
    ])

    // Calculate processing times
    const jobsWithProcessingTime = jobs.map(job => ({
      ...job,
      processingTime:
        job.processingStarted && job.processingEnded
          ? job.processingEnded.getTime() - job.processingStarted.getTime()
          : null,
    }))

    return NextResponse.json({
      jobs: jobsWithProcessingTime,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error('Get jobs error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    )
  }
}
