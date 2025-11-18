import { readFileSync } from 'fs'

export interface WhisperWord {
  word: string
  start: number
  end: number
  probability: number
}

export interface WhisperSegment {
  id: number
  seek: number
  start: number
  end: number
  text: string
  tokens: number[]
  temperature: number
  avg_logprob: number
  compression_ratio: number
  no_speech_prob: number
}

export interface WhisperResponse {
  text: string
  segments: WhisperSegment[]
  words: WhisperWord[]
  language: string
  duration: number
}

export class WhisperService {
  private apiUrl: string

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.WHISPER_API_URL || 'http://host.docker.internal:62277'
  }

  /**
   * Transcribe audio file with word-level confidence scores
   */
  async transcribe(audioPath: string): Promise<WhisperResponse> {
    try {
      // Read audio file
      const audioBuffer = readFileSync(audioPath)
      const audioBlob = new Blob([audioBuffer])

      // Create FormData
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.mp3')
      formData.append('model', 'whisper-1')
      formData.append('response_format', 'verbose_json')
      formData.append('timestamp_granularities[]', 'word')

      // Call Whisper API
      const response = await fetch(`${this.apiUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Whisper API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      return result as WhisperResponse
    } catch (error) {
      console.error('Whisper transcription error:', error)
      throw error
    }
  }

  /**
   * Extract word-level data with confidence scores
   */
  extractWords(response: WhisperResponse): WhisperWord[] {
    return response.words || []
  }

  /**
   * Filter low-confidence words
   */
  findLowConfidenceWords(
    words: WhisperWord[],
    threshold: number = 0.60
  ): WhisperWord[] {
    return words.filter(word => word.probability < threshold)
  }

  /**
   * Calculate average confidence for a segment
   */
  calculateAverageConfidence(words: WhisperWord[]): number {
    if (words.length === 0) return 1.0
    const sum = words.reduce((acc, word) => acc + word.probability, 0)
    return sum / words.length
  }
}

export const whisperService = new WhisperService()
