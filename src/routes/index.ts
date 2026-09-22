import { Router } from 'express';
import * as admin from '../controllers/admin.controller';
import * as auth from '../controllers/auth.controller';
import * as messages from '../controllers/message.controller';
import * as payments from '../controllers/payment.controller';
import * as projects from '../controllers/project.controller';
import * as users from '../controllers/user.controller';
import { allowRoles, requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));

router.post('/auth/register', asyncHandler(auth.register));
router.post('/auth/login', asyncHandler(auth.login));
router.get('/auth/me', requireAuth, asyncHandler(auth.me));

router.get('/users/profile', requireAuth, asyncHandler(users.getProfile));
router.put('/users/profile', requireAuth, asyncHandler(users.updateProfile));
router.put('/users/password', requireAuth, asyncHandler(users.changePassword));
router.get('/users/notifications', requireAuth, allowRoles('CLIENT'), asyncHandler(users.clientNotifications));
router.get('/users', requireAuth, allowRoles('ADMIN'), asyncHandler(users.getAllUsers));
router.get('/client/notifications', requireAuth, allowRoles('CLIENT'), asyncHandler(users.clientNotifications));

router.get('/projects', requireAuth, asyncHandler(projects.listProjects));
router.get('/projects/:id', requireAuth, asyncHandler(projects.getProject));
router.post('/projects', requireAuth, asyncHandler(projects.createProject));
router.put('/projects/:id/approve', requireAuth, asyncHandler(projects.approveProject));
router.put('/projects/:id/assign', requireAuth, asyncHandler(projects.assignFreelancers));
router.put('/projects/:id/status', requireAuth, asyncHandler(projects.updateStatus));
router.put('/projects/:id/progress', requireAuth, asyncHandler(projects.updateProgress));
router.put('/projects/:id/drop', requireAuth, asyncHandler(projects.requestDrop));
router.put('/projects/:id/pay-drop', requireAuth, asyncHandler(projects.payNoFeeDrop));
router.put('/projects/:id/approve-drop', requireAuth, asyncHandler(projects.approveDrop));
router.put('/projects/:id/complete', requireAuth, asyncHandler(projects.completeProject));
router.put('/projects/:id/rate', requireAuth, asyncHandler(projects.rateProject));
router.post('/projects/:id/assets', requireAuth, asyncHandler(projects.addAsset));
router.delete('/projects/:id/assets/:assetId', requireAuth, asyncHandler(projects.removeAsset));

router.get('/messages/:projectId', requireAuth, asyncHandler(messages.listMessages));
router.post('/messages/:projectId', requireAuth, asyncHandler(messages.postMessage));

router.post('/payments/create-order', requireAuth, asyncHandler(payments.createOrder));
router.post('/payments/verify', requireAuth, asyncHandler(payments.verifyPayment));
router.post('/payments/reject', requireAuth, asyncHandler(payments.rejectPayment));

router.get('/admin/dashboard/stats', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.dashboardStats));
router.get('/admin/companies', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.listCompanies));
router.get('/admin/companies/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.getCompany));
router.post('/admin/companies', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.createCompany));
router.put('/admin/companies/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.updateCompany));
router.delete('/admin/companies/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.deleteCompany));
router.get('/admin/freelancers', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.listFreelancers));
router.get('/admin/freelancers/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.getFreelancer));
router.post('/admin/freelancers', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.createFreelancer));
router.put('/admin/freelancers/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.updateFreelancer));
router.delete('/admin/freelancers/:id', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.deleteFreelancer));
router.get('/admin/projects', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.listAdminProjects));
router.get('/admin/payments', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.paymentSummary));
router.get('/admin/notifications', requireAuth, allowRoles('ADMIN'), asyncHandler(admin.adminNotifications));

export default router;
