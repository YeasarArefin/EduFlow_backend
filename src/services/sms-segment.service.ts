import type { SmsSegmentPreview } from '../types/sms';
const gsmBasic = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const gsmExtension = new Set('^{}\\[~]|€');
export function calculateSmsSegments(message: string, recipientCount: number): SmsSegmentPreview {
  const gsmUnits = [...message].every((char) => gsmBasic.has(char) || gsmExtension.has(char));
  const encoding = gsmUnits ? 'gsm-7' : 'unicode';
  const characters = [...message].reduce((total, char) => total + (gsmUnits && gsmExtension.has(char) ? 2 : 1), 0);
  const singleLimit = gsmUnits ? 160 : 70; const multipartLimit = gsmUnits ? 153 : 67;
  const segmentsPerRecipient = characters === 0 ? 0 : Math.ceil(characters / (characters <= singleLimit ? singleLimit : multipartLimit));
  return { characters, encoding, segmentsPerRecipient, recipientCount, totalCredits: segmentsPerRecipient * recipientCount };
}
