/**
 * Basic tests for Antonlytics SDK.
 */

import { Agent } from '../src/agent';
import { AntonlyticsError, AuthenticationError } from '../src/exceptions';

describe('Agent', () => {
  describe('initialization', () => {
    it('should initialize with valid config', () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project'
      });

      expect(agent).toBeInstanceOf(Agent);
    });

    it('should throw error without API key', () => {
      expect(() => {
        new Agent({
          apiKey: '',
          projectId: 'test_project'
        });
      }).toThrow(AntonlyticsError);
    });

    it('should throw error without project ID', () => {
      expect(() => {
        new Agent({
          apiKey: 'test_key',
          projectId: ''
        });
      }).toThrow(AntonlyticsError);
    });

    it('should use default base URL', () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project'
      });

      expect((agent as any).baseUrl).toBe('https://api.antonlytics.com');
    });

    it('should accept custom base URL', () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project',
        baseUrl: 'https://custom.api.com'
      });

      expect((agent as any).baseUrl).toBe('https://custom.api.com');
    });
  });

  describe('ingest', () => {
    it('should throw error with empty text', async () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project'
      });

      await expect(agent.ingest('')).rejects.toThrow(AntonlyticsError);
    });
  });

  describe('chat', () => {
    it('should throw error with empty message', async () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project'
      });

      await expect(agent.chat('')).rejects.toThrow(AntonlyticsError);
    });
  });

  describe('setSystemPrompt', () => {
    it('should throw error with empty prompt', async () => {
      const agent = new Agent({
        apiKey: 'test_key',
        projectId: 'test_project'
      });

      await expect(agent.setSystemPrompt('')).rejects.toThrow(AntonlyticsError);
    });
  });
});
