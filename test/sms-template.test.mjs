import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { renderSmsTemplate, validateSmsTemplateVariables } = require('../dist/src/services/sms-template.service.js');
describe('SMS templates', () => {
  it('renders supported Bangla and English variables', () => expect(renderSmsTemplate('প্রিয় {{student_name}}, due {{amount}}', { student_name: 'রাহিম', amount: '500' })).toBe('প্রিয় রাহিম, due 500'));
  it('rejects unsupported variables', () => expect(() => validateSmsTemplateVariables('Hello {{unknown_value}}')).toThrow('Unsupported SMS template variable'));
  it('renders absent allowed values as an empty string', () => expect(renderSmsTemplate('Hello {{guardian_name}}')).toBe('Hello '));
});
