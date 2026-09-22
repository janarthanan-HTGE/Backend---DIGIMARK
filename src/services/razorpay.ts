import Razorpay from 'razorpay';
import { HttpError } from '../utils/errors';

export function razorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new HttpError(503, 'Razorpay test credentials are not configured on the server.');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function dropPenaltyPercent(): number {
  const value = Number(process.env.DROP_PENALTY_PERCENT || 10);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : 10;
}
