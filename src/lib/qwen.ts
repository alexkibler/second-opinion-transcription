import { readFileSync } from 'fs'

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text' | 'audio'; text?: string; audio?: string }>
}

export interface QwenRequest {
  model: string
  messages: QwenMessage[]
  temperature?: number
  max_tokens?: number
}

export interface QwenResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class QwenService {
  private apiUrl: string

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.QWEN_API_URL || 'http://qwen2-audio:8000'
  }

  /**
   * Transcribe audio clip with Qwen2-Audio for correction
   */
  async correctTranscription(audioPath: string): Promise<string> {
    try {
      // Read audio file and convert to base64
      const audioBuffer = readFileSync(audioPath)
      const base64Audio = audioBuffer.toString('base64')

      // Construct the request payload
      const request: QwenRequest = {
        model: 'Qwen/Qwen2-Audio-7B-Instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a precise audio transcription assistant.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'audio',
                audio: base64Audio,
              },
              {
                type: 'text',
                text: 'Transcribe the speech in this audio clip exactly. Do not add preamble. Do not translate. If the audio is unintelligible, output [unintelligible]. Only return the raw transcription.',
              },
            ],
          },
        ],
        temperature: 0.1, // Low temperature for consistent output
        max_tokens: 500,
      }

      // Call Qwen2-Audio API
      const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Qwen API error: ${response.status} - ${errorText}`)
      }

      const result: QwenResponse = await response.json()

      // Extract the transcription text
      const transcription = result.choices[0]?.message?.content || ''

      // Clean up the response (remove common preambles)
      return this.cleanTranscription(transcription)
    } catch (error) {
      console.error('Qwen correction error:', error)
      throw error
    }
  }

  /**
   * Clean up transcription text
   */
  private cleanTranscription(text: string): string {
    // Remove common preambles
    const preambles = [
      /^The speaker (said|says):\s*/i,
      /^The audio (says|contains):\s*/i,
      /^Transcription:\s*/i,
      /^Here is the transcription:\s*/i,
    ]

    let cleaned = text.trim()
    for (const preamble of preambles) {
      cleaned = cleaned.replace(preamble, '')
    }

    return cleaned.trim()
  }
}

export const qwenService = new QwenService()
