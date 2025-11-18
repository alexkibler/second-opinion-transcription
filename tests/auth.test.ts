import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, isValidEmail, isValidPassword } from '../src/lib/auth'

describe('Authentication', () => {
  describe('Password hashing', () => {
    it('should hash password', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)

      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(20)
    })

    it('should verify correct password', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword(password, hash)

      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('WrongPassword', hash)

      expect(isValid).toBe(false)
    })

    it('should create different hashes for same password', async () => {
      const password = 'TestPassword123'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Email validation', () => {
    it('should accept valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
      expect(isValidEmail('test+tag@example.com')).toBe(true)
    })

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false)
      expect(isValidEmail('@example.com')).toBe(false)
      expect(isValidEmail('test@')).toBe(false)
      expect(isValidEmail('test @example.com')).toBe(false)
    })
  })

  describe('Password strength validation', () => {
    it('should accept strong passwords', () => {
      const result = isValidPassword('TestPassword123')
      expect(result.valid).toBe(true)
    })

    it('should reject short passwords', () => {
      const result = isValidPassword('Test12')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('8 characters')
    })

    it('should reject passwords without lowercase', () => {
      const result = isValidPassword('TESTPASSWORD123')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('lowercase')
    })

    it('should reject passwords without uppercase', () => {
      const result = isValidPassword('testpassword123')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('uppercase')
    })

    it('should reject passwords without numbers', () => {
      const result = isValidPassword('TestPassword')
      expect(result.valid).toBe(false)
      expect(result.message).toContain('number')
    })
  })
})
