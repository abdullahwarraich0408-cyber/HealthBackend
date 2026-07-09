const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const communityController = require('./community.controller');
const communityValidator = require('./community.validator');
const { validate } = require('../../middleware/validate.middleware');
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const env = require('../../config/env');
const prisma = require('../../config/database');
const catchAsync = require('../../utils/catchAsync');

/** Attach user when Bearer token is present; continue as guest otherwise */
const optionalAuth = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const accountId = decoded.accountId || decoded.id;
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { customer: true },
    });
    if (account?.customer) {
      req.user = { ...account.customer, role: 'customer', accountId: account.id };
    }
  } catch {
    // ignore invalid token for public reads
  }
  next();
});

router.get('/posts', optionalAuth, communityController.getPosts);
router.get('/posts/:id', optionalAuth, communityController.getPost);
router.get('/groups', optionalAuth, communityController.getGroups);
router.get('/groups/:id', optionalAuth, communityController.getGroup);
router.get('/challenges', optionalAuth, communityController.getChallenges);
router.get('/challenges/:id', optionalAuth, communityController.getChallenge);

router.use(protect, restrictTo('customer'));

router.post(
  '/posts',
  validate(communityValidator.createPostSchema),
  communityController.createPost,
);
router.post(
  '/posts/:id/comments',
  validate(communityValidator.createCommentSchema),
  communityController.addComment,
);
router.post('/posts/:id/like', communityController.toggleLike);

router.post(
  '/groups',
  validate(communityValidator.createGroupSchema),
  communityController.createGroup,
);
router.post('/groups/:id/join', communityController.joinGroup);
router.delete('/groups/:id/leave', communityController.leaveGroup);
router.get('/groups/:id/members', communityController.getGroupMembers);
router.post(
  '/groups/:id/members',
  validate(communityValidator.addGroupMemberSchema),
  communityController.addGroupMember,
);

router.post(
  '/challenges',
  validate(communityValidator.createChallengeSchema),
  communityController.createChallenge,
);
router.post('/challenges/:id/join', communityController.joinChallenge);
router.delete('/challenges/:id/leave', communityController.leaveChallenge);
router.patch(
  '/challenges/:id/progress',
  validate(communityValidator.updateProgressSchema),
  communityController.updateProgress,
);

router.get('/buddies', communityController.getBuddies);
router.get('/buddies/suggestions', communityController.getBuddySuggestions);
router.post(
  '/buddies',
  validate(communityValidator.addBuddySchema),
  communityController.addBuddy,
);
router.delete('/buddies/:id', communityController.removeBuddy);
router.post('/buddies/:id/encourage', communityController.encourageBuddy);

router.get('/profile/me', communityController.getProfile);
router.get('/reports/weekly', communityController.getWeeklyReport);
router.get('/users/search', communityController.searchUsers);

module.exports = router;
