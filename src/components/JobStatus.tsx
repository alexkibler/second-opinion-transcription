'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface JobStatusProps {
  jobId: string
}

export default function JobStatus({ jobId }: JobStatusProps) {
  const [showTranscript, setShowTranscript] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${jobId}`)
      if (!response.ok) throw new Error('Failed to fetch job')
      return response.json()
    },
    refetchInterval: (query) => {
      const job = query.state.data?.job
      // Only poll if job is pending or processing
      return job?.status === 'PENDING' || job?.status === 'PROCESSING' ? 3000 : false
    },
  })

  if (isLoading || !data) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse">
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
      </div>
    )
  }

  const job = data.job

  const statusColors = {
    PENDING: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    PROCESSING: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    COMPLETED: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    FAILED: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
  }

  const statusEmojis = {
    PENDING: '⏳',
    PROCESSING: '🔄',
    COMPLETED: '✅',
    FAILED: '❌',
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2">{job.originalFileName}</h3>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[job.status as keyof typeof statusColors]}`}
            >
              {statusEmojis[job.status as keyof typeof statusEmojis]} {job.status}
            </span>
            {job.processingTime && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Processed in {(job.processingTime / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm text-gray-600 dark:text-gray-400">
          <p>Job ID: {job.id.substring(0, 8)}...</p>
          <p>
            Created: {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {job.errorMessage && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
          Error: {job.errorMessage}
        </div>
      )}

      {job.status === 'PROCESSING' && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Processing... This may take a few minutes depending on audio length.
          </p>
        </div>
      )}

      {job.transcript && (
        <div className="mt-4">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-blue-600 hover:underline font-medium"
          >
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>

          {showTranscript && (
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{job.transcript}</p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(job.transcript)
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([job.transcript], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${job.originalFileName}_transcript.txt`
                    a.click()
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm"
                >
                  Download
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {job.segmentCount > 0 && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {job.segmentCount} word segments analyzed
        </p>
      )}
    </div>
  )
}
