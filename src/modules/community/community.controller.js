const catchAsync = require('../../utils/catchAsync');
const communityService = require('./community.service');

function viewerId(req) {
  return req.user?.id || null;
}

exports.getPosts = catchAsync(async (req, res) => {
  const data = await communityService.getPosts(req.query, viewerId(req));
  res.status(200).json({ status: 'success', ...data });
});

exports.getPost = catchAsync(async (req, res) => {
  const data = await communityService.getPostById(req.params.id, viewerId(req));
  res.status(200).json({ status: 'success', ...data });
});

exports.createPost = catchAsync(async (req, res) => {
  const data = await communityService.createPost(req.user.id, req.body);
  res.status(201).json({ status: 'success', ...data });
});

exports.addComment = catchAsync(async (req, res) => {
  const data = await communityService.addComment(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(201).json({ status: 'success', ...data });
});

exports.toggleLike = catchAsync(async (req, res) => {
  const data = await communityService.toggleLike(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.getGroups = catchAsync(async (req, res) => {
  const data = await communityService.getGroups(viewerId(req));
  res.status(200).json({ status: 'success', ...data });
});

exports.getGroup = catchAsync(async (req, res) => {
  const data = await communityService.getGroupById(req.params.id, viewerId(req));
  res.status(200).json({ status: 'success', ...data });
});

exports.createGroup = catchAsync(async (req, res) => {
  const data = await communityService.createGroup(req.user.id, req.body);
  res.status(201).json({ status: 'success', ...data });
});

exports.joinGroup = catchAsync(async (req, res) => {
  const data = await communityService.joinGroup(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.leaveGroup = catchAsync(async (req, res) => {
  const data = await communityService.leaveGroup(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.getGroupMembers = catchAsync(async (req, res) => {
  const data = await communityService.getGroupMembers(req.params.id, req.user.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.addGroupMember = catchAsync(async (req, res) => {
  const data = await communityService.addGroupMember(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(201).json({ status: 'success', ...data });
});

exports.getChallenges = catchAsync(async (req, res) => {
  const data = await communityService.getChallenges(viewerId(req));
  res.status(200).json({ status: 'success', ...data });
});

exports.getChallenge = catchAsync(async (req, res) => {
  const data = await communityService.getChallengeById(
    req.params.id,
    viewerId(req),
  );
  res.status(200).json({ status: 'success', ...data });
});

exports.createChallenge = catchAsync(async (req, res) => {
  const data = await communityService.createChallenge(req.user.id, req.body);
  res.status(201).json({ status: 'success', ...data });
});

exports.joinChallenge = catchAsync(async (req, res) => {
  const data = await communityService.joinChallenge(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.leaveChallenge = catchAsync(async (req, res) => {
  const data = await communityService.leaveChallenge(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.updateProgress = catchAsync(async (req, res) => {
  const data = await communityService.updateChallengeProgress(
    req.user.id,
    req.params.id,
    req.body,
  );
  res.status(200).json({ status: 'success', ...data });
});

exports.getBuddies = catchAsync(async (req, res) => {
  const data = await communityService.getBuddies(req.user.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.getBuddySuggestions = catchAsync(async (req, res) => {
  const data = await communityService.getBuddySuggestions(req.user.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.addBuddy = catchAsync(async (req, res) => {
  const data = await communityService.addBuddy(req.user.id, req.body);
  res.status(201).json({ status: 'success', ...data });
});

exports.removeBuddy = catchAsync(async (req, res) => {
  const data = await communityService.removeBuddy(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.encourageBuddy = catchAsync(async (req, res) => {
  const data = await communityService.encourageBuddy(req.user.id, req.params.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.getProfile = catchAsync(async (req, res) => {
  const data = await communityService.getProfile(req.user.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.getWeeklyReport = catchAsync(async (req, res) => {
  const data = await communityService.getWeeklyReport(req.user.id);
  res.status(200).json({ status: 'success', ...data });
});

exports.searchUsers = catchAsync(async (req, res) => {
  const data = await communityService.searchUsers(req.query.q, req.user.id);
  res.status(200).json({ status: 'success', ...data });
});
