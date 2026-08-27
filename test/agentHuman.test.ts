import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAgentUser,
  isAgentTriggered,
  generateAgentResponse,
  createAgentMessage,
  TALK_TO_HUMAN_CHANNEL_ID
} from '../src/engine/agentResponder';
import { DataIsolationGuard } from '../src/security/dataIsolationGuard';

test('Human Agent & Talk to a Human Channel Suite', async (t) => {
  await t.test('getAgentUser returns Human identity', () => {
    const user = getAgentUser();
    assert.strictEqual(user.id, 'agent_human');
    assert.strictEqual(user.name, 'Human');
    assert.strictEqual(user.role, 'agent');
    assert.strictEqual(user.isBot, true);
    assert.strictEqual(user.avatar, '👤');
  });

  await t.test('TALK_TO_HUMAN_CHANNEL_ID is chan_talk_to_a_human', () => {
    assert.strictEqual(TALK_TO_HUMAN_CHANNEL_ID, 'chan_talk_to_a_human');
  });

  await t.test('isAgentTriggered returns true for messages in Talk to a Human channel', () => {
    assert.strictEqual(isAgentTriggered('Hello there', TALK_TO_HUMAN_CHANNEL_ID), true);
    assert.strictEqual(isAgentTriggered('Can you help me?', 'chan_talk_to_a_human'), true);
  });

  await t.test('isAgentTriggered returns true in DM channel with Human agent', () => {
    assert.strictEqual(isAgentTriggered('Private question', 'chan_dm_agent_human__user_alice', 'agent_human'), true);
  });

  await t.test('isAgentTriggered returns true for @Human or /human mentions in any channel', () => {
    assert.strictEqual(isAgentTriggered('Hey @Human what is our git status?', 'chan_general'), true);
    assert.strictEqual(isAgentTriggered('/human explain AES-GCM-256', 'chan_engineering'), true);
    assert.strictEqual(isAgentTriggered('Can @agent check this?', 'chan_random'), true);
    assert.strictEqual(isAgentTriggered('/agent help', 'chan_general'), true);
  });

  await t.test('isAgentTriggered returns false for normal messages in other channels without mention', () => {
    assert.strictEqual(isAgentTriggered('Deploying release v1.0.0 today', 'chan_general'), false);
    assert.strictEqual(isAgentTriggered('Lunch time anyone?', 'chan_random'), false);
  });

  await t.test('generateAgentResponse produces helpful and intelligent responses', () => {
    const greeting = generateAgentResponse('hello');
    assert.ok(greeting.toLowerCase().includes('human'));

    const help = generateAgentResponse('/help');
    assert.ok(help.includes('Git-Chat') || help.includes('Human'));

    const encryption = generateAgentResponse('How does E2EE encryption work?');
    assert.ok(encryption.includes('AES-GCM-256') || encryption.includes('E2EE') || encryption.includes('vault'));

    const code = generateAgentResponse('write a function to add two numbers in typescript');
    assert.ok(code.includes('```') || code.includes('function') || code.includes('TypeScript'));
  });

  await t.test('createAgentMessage creates properly structured ChatMessage', () => {
    const msg = createAgentMessage('chan_talk_to_a_human', 'Hello, how can I help?');
    assert.strictEqual(msg.channelId, 'chan_talk_to_a_human');
    assert.strictEqual(msg.author.id, 'agent_human');
    assert.strictEqual(msg.author.name, 'Human');
    assert.strictEqual(msg.author.isBot, true);
    assert.strictEqual(msg.content, 'Hello, how can I help?');
    assert.ok(msg.timestamp > 0);
  });

  await t.test('DataIsolationGuard allows agent_human write paths', () => {
    const validPath = 'channels/chan_talk_to_a_human/messages/1724760000000_agent_human_msg-001.json';
    assert.ok(DataIsolationGuard.validateWritePath(validPath, 'agent_human'));

    const profilePath = 'users/agent_human.json';
    assert.ok(DataIsolationGuard.validateWritePath(profilePath, 'agent_human'));

    const presencePath = 'presence/agent_human.json';
    assert.ok(DataIsolationGuard.validateWritePath(presencePath, 'agent_human'));
  });
});
