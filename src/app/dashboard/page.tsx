'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import UploadForm from '@/components/UploadForm'
import JobList from '@/components/JobList'

interface User {
  id: string
  email: string
  name: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)

  // Fetch current user
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me')
      if (!response.ok) throw new Error('Failed to fetch user')
      return response.json()
    },
  })

  const user: User | undefined = userData?.user

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">CAHTS Dashboard</h1>
            {user && (
              <p className="text-gray-600 dark:text-gray-400">
                Welcome, {user.name || user.email}
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
            >
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 p-6 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Settings</h2>
            <SettingsForm onClose={() => setShowSettings(false)} />
          </div>
        )}

        {/* Upload Form */}
        <div className="mb-8">
          <UploadForm />
        </div>

        {/* Job List */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Your Transcriptions</h2>
          <JobList />
        </div>
      </div>
    </main>
  )
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          discordWebhookUrl: discordWebhook || null,
        }),
      })

      if (!response.ok) throw new Error('Failed to update settings')

      setMessage('Settings updated successfully')
      setTimeout(onClose, 1500)
    } catch (error) {
      setMessage('Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div className="p-3 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-lg">
          {message}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block mb-2 font-medium">
          Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      <div>
        <label htmlFor="discordWebhook" className="block mb-2 font-medium">
          Discord Webhook URL
        </label>
        <input
          type="url"
          id="discordWebhook"
          value={discordWebhook}
          onChange={(e) => setDiscordWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
