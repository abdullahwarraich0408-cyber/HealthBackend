const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { moderatePostContent, formatTimeAgo } = require('../../utils/communityModeration');

async function ensureCommunityProfile(userId) {
  return prisma.communityProfile.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
  });
}

function displayName(user, isAnonymous) {
  if (isAnonymous) return 'Anonymous';
  return user?.name?.trim() || 'Community member';
}

function mapPost(post, viewerId) {
  const likedByMe = viewerId
    ? Array.isArray(post.likes) && post.likes.length > 0
    : false;

  return {
    id: post.id,
    authorName: displayName(post.user, post.is_anonymous),
    authorRole: post.author_role,
    postType: post.post_type || 'text',
    content: post.content,
    imageUrl: post.image_url || null,
    videoUrl: post.video_url || null,
    thumbnailUrl: post.thumbnail_url || null,
    category: post.category,
    likes: post._count?.likes ?? post.likes?.length ?? 0,
    comments: post._count?.comments ?? post.comments?.length ?? 0,
    commentList: (post.comments || []).map(c => ({
      id: c.id,
      authorName: displayName(c.user, c.is_anonymous),
      isAnonymous: c.is_anonymous,
      content: c.content,
      timeAgo: formatTimeAgo(c.created_at),
      isVerified: c.user?.is_verified || false,
    })),
    isVerified: post.is_verified,
    isAnonymous: post.is_anonymous,
    timeAgo: formatTimeAgo(post.created_at),
    likedByMe,
    healthContribution: post.health_contribution,
    groupId: post.group_id,
  };
}

function mapGroup(group, viewerId) {
  const membership = group.members?.find(m => m.user_id === viewerId);
  const moderators = (group.members || [])
    .filter(m => m.role === 'moderator' || m.role === 'admin')
    .map(m => m.user?.name || 'Moderator');

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    icon: group.icon,
    memberCount: group._count?.members ?? group.members?.length ?? 0,
    postCount: group._count?.posts ?? 0,
    isJoined: Boolean(membership),
    isModerator: membership?.role === 'moderator' || membership?.role === 'admin',
    moderators,
    verifiedDoctors: Array.isArray(group.verified_doctors) ? group.verified_doctors : [],
    weeklyTopic: group.weekly_topic,
    createdBy: group.created_by,
  };
}

function daysLeft(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function mapChallenge(challenge, viewerId) {
  const participation = challenge.participants?.find(p => p.user_id === viewerId);
  const leaderboard = [...(challenge.participants || [])]
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 10)
    .map((p, index) => ({
      id: p.user_id,
      name: p.user?.name || 'Participant',
      progress: p.progress,
      rank: index + 1,
      isFriend: false,
    }));

  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    icon: challenge.icon,
    color: challenge.color,
    progress: participation?.progress ?? 0,
    target: challenge.target,
    unit: challenge.unit,
    daysLeft: daysLeft(challenge.ends_at),
    isJoined: Boolean(participation),
    participants: challenge._count?.participants ?? challenge.participants?.length ?? 0,
    leaderboard,
    xpReward: challenge.xp_reward,
    badgeName: challenge.badge_name,
    createdBy: challenge.created_by,
  };
}

async function assertGroupMember(userId, groupId) {
  const membership = await prisma.groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
  });
  if (!membership) {
    throw new AppError('Join this group to participate in discussions', 403);
  }
  return membership;
}

async function getPosts(query = {}, viewerId = null) {
  const where = {};
  if (query.group_id) {
    where.group_id = query.group_id;
  } else {
    where.group_id = null;
  }

  if (query.group_id) {
    if (!viewerId) {
      return { posts: [], requiresJoin: true };
    }
    const membership = await prisma.groupMember.findUnique({
      where: {
        group_id_user_id: { group_id: query.group_id, user_id: viewerId },
      },
    });
    if (!membership) {
      return { posts: [], requiresJoin: true };
    }
  }

  const posts = await prisma.communityPost.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, is_verified: true } },
      likes: viewerId ? { where: { user_id: viewerId } } : false,
      comments: {
        take: 5,
        orderBy: { created_at: 'asc' },
        include: { user: { select: { id: true, name: true, is_verified: true } } },
      },
      _count: { select: { likes: true, comments: true } },
    },
    orderBy: { created_at: 'desc' },
    take: Math.min(Number(query.limit) || 50, 100),
  });

  let mapped = posts.map(p => mapPost(p, viewerId));

  if (query.filter === 'verified') {
    mapped = mapped.filter(p => p.isVerified);
  }

  if (query.filter === 'videos') {
    mapped = mapped.filter(p => p.postType === 'video');
  }

  return { posts: mapped };
}

async function getPostById(postId, viewerId = null) {
  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    include: {
      user: { select: { id: true, name: true, is_verified: true } },
      likes: viewerId ? { where: { user_id: viewerId } } : false,
      comments: {
        orderBy: { created_at: 'asc' },
        include: { user: { select: { id: true, name: true, is_verified: true } } },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  if (!post) throw new AppError('Post not found', 404);
  return { post: mapPost(post, viewerId) };
}

async function createPost(userId, body) {
  const textToModerate =
    (body.content || '').trim() ||
    body.image_url ||
    body.video_url ||
    'health post';
  const moderation = moderatePostContent(textToModerate);
  if (!moderation.approved) {
    throw new AppError(moderation.reason, 400);
  }

  if (body.group_id) {
    await assertGroupMember(userId, body.group_id);
  }

  await ensureCommunityProfile(userId);

  const post = await prisma.communityPost.create({
    data: {
      user_id: userId,
      group_id: body.group_id || null,
      post_type: body.post_type || 'text',
      content: (body.content || '').trim(),
      image_url: body.image_url || null,
      video_url: body.video_url || null,
      thumbnail_url: body.thumbnail_url || null,
      category: body.category || 'General',
      is_anonymous: Boolean(body.is_anonymous),
    },
    include: {
      user: { select: { id: true, name: true, is_verified: true } },
      comments: true,
      _count: { select: { likes: true, comments: true } },
    },
  });

  await prisma.communityProfile.update({
    where: { user_id: userId },
    data: {
      xp: { increment: 5 },
      contribution_score: { increment: 5 },
    },
  });

  return { post: mapPost(post, userId) };
}

async function addComment(userId, postId, body) {
  const moderation = moderatePostContent(body.content);
  if (!moderation.approved) {
    throw new AppError(moderation.reason, 400);
  }

  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw new AppError('Post not found', 404);

  if (post.group_id) {
    await assertGroupMember(userId, post.group_id);
  }

  const comment = await prisma.communityComment.create({
    data: {
      post_id: postId,
      user_id: userId,
      content: body.content.trim(),
    },
    include: { user: { select: { id: true, name: true, is_verified: true } } },
  });

  return {
    comment: {
      id: comment.id,
      authorName: displayName(comment.user, false),
      isAnonymous: false,
      content: comment.content,
      timeAgo: formatTimeAgo(comment.created_at),
      isVerified: comment.user?.is_verified || false,
    },
  };
}

async function toggleLike(userId, postId) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) throw new AppError('Post not found', 404);

  const existing = await prisma.communityPostLike.findUnique({
    where: { post_id_user_id: { post_id: postId, user_id: userId } },
  });

  if (existing) {
    await prisma.communityPostLike.delete({
      where: { post_id_user_id: { post_id: postId, user_id: userId } },
    });
    return { liked: false };
  }

  await prisma.communityPostLike.create({
    data: { post_id: postId, user_id: userId },
  });
  return { liked: true };
}

async function getGroups(viewerId = null) {
  const groups = await prisma.healthGroup.findMany({
    include: {
      members: {
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { members: true, posts: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return { groups: groups.map(g => mapGroup(g, viewerId)) };
}

async function getGroupById(groupId, viewerId = null) {
  const group = await prisma.healthGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { members: true, posts: true } },
    },
  });

  if (!group) throw new AppError('Group not found', 404);
  return { group: mapGroup(group, viewerId) };
}

async function createGroup(userId, body) {
  const group = await prisma.healthGroup.create({
    data: {
      name: body.name,
      description: body.description || '',
      icon: body.icon || 'account-group',
      weekly_topic: body.weekly_topic || null,
      created_by: userId,
      members: {
        create: { user_id: userId, role: 'admin' },
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { members: true, posts: true } },
    },
  });

  return { group: mapGroup(group, userId) };
}

async function joinGroup(userId, groupId) {
  const group = await prisma.healthGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError('Group not found', 404);

  await prisma.groupMember.upsert({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    create: { group_id: groupId, user_id: userId, role: 'member' },
    update: {},
  });

  return getGroupById(groupId, userId);
}

async function leaveGroup(userId, groupId) {
  const membership = await prisma.groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
  });
  if (!membership) throw new AppError('Not a member of this group', 400);

  if (membership.role === 'admin') {
    const adminCount = await prisma.groupMember.count({
      where: { group_id: groupId, role: 'admin' },
    });
    if (adminCount <= 1) {
      throw new AppError('Transfer admin role before leaving as the only admin', 400);
    }
  }

  await prisma.groupMember.delete({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
  });

  return { left: true };
}

async function getGroupMembers(groupId, viewerId) {
  const group = await prisma.healthGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new AppError('Group not found', 404);

  const members = await prisma.groupMember.findMany({
    where: { group_id: groupId },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { joined_at: 'asc' },
  });

  const viewerMembership = members.find(m => m.user_id === viewerId);

  return {
    members: members.map(m => ({
      id: m.user_id,
      name: m.user?.name || 'Member',
      role: m.role,
      joinedAt: m.joined_at,
      avatar: m.user?.avatar,
    })),
    canManage:
      viewerMembership?.role === 'admin' || viewerMembership?.role === 'moderator',
  };
}

async function addGroupMember(actorId, groupId, body) {
  const actor = await prisma.groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: actorId } },
  });
  if (!actor || (actor.role !== 'admin' && actor.role !== 'moderator')) {
    throw new AppError('Only moderators can add members', 403);
  }

  const target = await prisma.user.findUnique({ where: { id: body.user_id } });
  if (!target) throw new AppError('User not found', 404);

  await prisma.groupMember.upsert({
    where: {
      group_id_user_id: { group_id: groupId, user_id: body.user_id },
    },
    create: { group_id: groupId, user_id: body.user_id, role: 'member' },
    update: {},
  });

  return getGroupMembers(groupId, actorId);
}

async function getChallenges(viewerId = null) {
  const challenges = await prisma.healthChallenge.findMany({
    include: {
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { participants: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return { challenges: challenges.map(c => mapChallenge(c, viewerId)) };
}

async function getChallengeById(challengeId, viewerId = null) {
  const challenge = await prisma.healthChallenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { participants: true } },
    },
  });

  if (!challenge) throw new AppError('Challenge not found', 404);
  return { challenge: mapChallenge(challenge, viewerId) };
}

async function createChallenge(userId, body) {
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + (body.duration_days || 7));

  const challenge = await prisma.healthChallenge.create({
    data: {
      title: body.title,
      description: body.description || '',
      icon: body.icon || 'trophy',
      color: body.color || '#0B6E72',
      target: body.target || 100,
      unit: body.unit || 'steps',
      duration_days: body.duration_days || 7,
      xp_reward: body.xp_reward || 100,
      badge_name: body.badge_name || 'Achiever',
      created_by: userId,
      ends_at: endsAt,
      participants: {
        create: { user_id: userId, progress: 0 },
      },
    },
    include: {
      participants: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { participants: true } },
    },
  });

  return { challenge: mapChallenge(challenge, userId) };
}

async function joinChallenge(userId, challengeId) {
  const challenge = await prisma.healthChallenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) throw new AppError('Challenge not found', 404);

  await prisma.challengeParticipant.upsert({
    where: {
      challenge_id_user_id: { challenge_id: challengeId, user_id: userId },
    },
    create: { challenge_id: challengeId, user_id: userId },
    update: {},
  });

  return getChallengeById(challengeId, userId);
}

async function leaveChallenge(userId, challengeId) {
  await prisma.challengeParticipant.deleteMany({
    where: { challenge_id: challengeId, user_id: userId },
  });
  return { left: true };
}

async function updateChallengeProgress(userId, challengeId, body) {
  const participation = await prisma.challengeParticipant.findUnique({
    where: {
      challenge_id_user_id: { challenge_id: challengeId, user_id: userId },
    },
  });
  if (!participation) throw new AppError('Join the challenge first', 400);

  await prisma.challengeParticipant.update({
    where: { id: participation.id },
    data: { progress: body.progress },
  });

  return getChallengeById(challengeId, userId);
}

async function getBuddies(userId) {
  const buddies = await prisma.healthBuddy.findMany({
    where: { user_id: userId },
    include: { buddy: { select: { id: true, name: true } } },
  });

  return {
    buddies: buddies.map(b => ({
      id: b.id,
      userId: b.buddy_user_id,
      name: b.buddy?.name || 'Buddy',
      relation: b.relation,
      streakDays: 0,
      lastEncouragement: b.last_encouragement,
      isOnline: false,
    })),
  };
}

async function getBuddySuggestions(userId) {
  const existing = await prisma.healthBuddy.findMany({
    where: { user_id: userId },
    select: { buddy_user_id: true },
  });
  const exclude = new Set([userId, ...existing.map(b => b.buddy_user_id)]);

  const groupMembers = await prisma.groupMember.findMany({
    where: {
      group: {
        members: { some: { user_id: userId } },
      },
      user_id: { notIn: [...exclude] },
    },
    include: { user: { select: { id: true, name: true } }, group: true },
    take: 20,
  });

  const challengePeers = await prisma.challengeParticipant.findMany({
    where: {
      challenge: {
        participants: { some: { user_id: userId } },
      },
      user_id: { notIn: [...exclude] },
    },
    include: { user: { select: { id: true, name: true } }, challenge: true },
    take: 20,
  });

  const seen = new Set();
  const suggestions = [];

  for (const m of groupMembers) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    suggestions.push({
      id: m.user_id,
      name: m.user?.name || 'Member',
      subtitle: `From ${m.group?.name || 'group'}`,
      source: 'group',
      healthLevel: 5,
    });
  }

  for (const p of challengePeers) {
    if (seen.has(p.user_id)) continue;
    seen.add(p.user_id);
    suggestions.push({
      id: p.user_id,
      name: p.user?.name || 'Participant',
      subtitle: `From ${p.challenge?.title || 'challenge'}`,
      source: 'challenge',
      healthLevel: 5,
    });
  }

  return { suggestions: suggestions.slice(0, 15) };
}

async function addBuddy(userId, body) {
  if (userId === body.user_id) {
    throw new AppError('You cannot add yourself as a buddy', 400);
  }

  const target = await prisma.user.findUnique({ where: { id: body.user_id } });
  if (!target) throw new AppError('User not found', 404);

  const buddy = await prisma.healthBuddy.upsert({
    where: {
      user_id_buddy_user_id: { user_id: userId, buddy_user_id: body.user_id },
    },
    create: {
      user_id: userId,
      buddy_user_id: body.user_id,
      relation: body.relation || 'friend',
    },
    update: { relation: body.relation || 'friend' },
    include: { buddy: { select: { id: true, name: true } } },
  });

  return {
    buddy: {
      id: buddy.id,
      userId: buddy.buddy_user_id,
      name: buddy.buddy?.name || 'Buddy',
      relation: buddy.relation,
      streakDays: 0,
    },
  };
}

async function removeBuddy(userId, buddyId) {
  const buddy = await prisma.healthBuddy.findFirst({
    where: { id: buddyId, user_id: userId },
  });
  if (!buddy) throw new AppError('Buddy not found', 404);

  await prisma.healthBuddy.delete({ where: { id: buddyId } });
  return { removed: true };
}

async function encourageBuddy(userId, buddyId) {
  const buddy = await prisma.healthBuddy.findFirst({
    where: { id: buddyId, user_id: userId },
  });
  if (!buddy) throw new AppError('Buddy not found', 404);

  const message = 'Keep going — you are doing great!';
  await prisma.healthBuddy.update({
    where: { id: buddyId },
    data: { last_encouragement: message, encouraged_at: new Date() },
  });

  return { message };
}

async function getProfile(userId) {
  const profile = await ensureCommunityProfile(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, profile_data: true },
  });

  const postsCount = await prisma.communityPost.count({
    where: { user_id: userId },
  });

  const healthScore =
    user?.profile_data?.healthScore ??
    user?.profile_data?.health_score ??
    75;

  return {
    profile: {
      displayName: user?.name || 'You',
      healthLevel: profile.health_level,
      healthScore,
      xp: profile.xp,
      coins: profile.coins,
      followers: profile.followers,
      following: profile.following,
      postsCount,
      contributionScore: profile.contribution_score,
    },
  };
}

async function getWeeklyReport(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile_data: true },
  });
  const pd = user?.profile_data || {};

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const bookings = await prisma.labTestBooking.count({
    where: { customer_id: userId, created_at: { gte: weekStart } },
  });

  return {
    report: {
      weekLabel: `${weekStart.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}`,
      healthScoreChange: pd.weeklyHealthDelta ?? 2,
      medicineAdherence: pd.medicineAdherence ?? 85,
      stepsTotal: pd.stepsTotal ?? pd.steps ?? 35000,
      waterGlasses: pd.waterGlasses ?? 42,
      sleepAverage: pd.sleepAverage ?? '7h 00m',
      streakSummary: pd.streakSummary ?? 'Keep your daily check-ins going',
      topAchievement: bookings > 0 ? 'Booked a lab test this week' : 'Stayed active in the community',
      aiRecommendation:
        'Great week. Keep your medicine routine and connect with your health buddies.',
    },
  };
}

async function searchUsers(query, viewerId) {
  const q = String(query || '').trim();
  if (q.length < 2) return { users: [] };

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerId },
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true },
    take: 15,
  });

  return { users };
}

module.exports = {
  getPosts,
  getPostById,
  createPost,
  addComment,
  toggleLike,
  getGroups,
  getGroupById,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  addGroupMember,
  getChallenges,
  getChallengeById,
  createChallenge,
  joinChallenge,
  leaveChallenge,
  updateChallengeProgress,
  getBuddies,
  getBuddySuggestions,
  addBuddy,
  removeBuddy,
  encourageBuddy,
  getProfile,
  getWeeklyReport,
  searchUsers,
};
