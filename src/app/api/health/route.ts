import { NextResponse } from 'next/server'

/**
 * Basic health check endpoint
 * Returns 200 OK if the service is running
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
