'use client'

import { useQuery } from '@tanstack/react-query'
import JobStatus from './JobStatus'

interface Job {
  id: string
  status: string
  originalFileName: string
  createdAt: string
  processingTime: number | null
}

export default function JobList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const response = await fetch('/api/jobs')
      if (!response.ok) throw new Error('Failed to fetch jobs')
      return response.json()
    },
    refetchInterval: 5000, // Poll every 5 seconds
  })

  if (isLoading) {
    return <div className="text-center py-8">Loading jobs...</div>
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg">
        Error loading jobs
      </div>
    )
  }

  const jobs: Job[] = data?.jobs || []

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        No transcriptions yet. Upload an audio file to get started!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobStatus key={job.id} jobId={job.id} />
      ))}
    </div>
  )
}
