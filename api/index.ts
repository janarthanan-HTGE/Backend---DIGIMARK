import type { Request, Response } from 'express';
import { app } from '../src/server';
import { connectDatabase } from '../src/config/database';

export default async function handler(req: Request, res: Response): Promise<void> {
	if (req.method === 'OPTIONS') {
		app(req, res);
		return;
	}

	try {
		await connectDatabase();
		app(req, res);
	} catch (error) {
		console.error('Unable to connect to MongoDB:', error);
		res.status(500).json({ message: 'Unable to connect to the database.' });
	}
}
