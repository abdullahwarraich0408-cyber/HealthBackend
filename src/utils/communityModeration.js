function moderatePostContent(content) {
  const trimmed = String(content || '').trim();

  if (trimmed.length < 10) {
    return {
      approved: false,
      reason: 'Please write at least 10 characters so others can understand your post.',
    };
  }

  if (trimmed.length > 2000) {
    return {
      approved: false,
      reason: 'Post is too long. Please keep it under 2000 characters.',
    };
  }

  const blocked = [
    /cure\s+cancer/i,
    /stop\s+taking\s+(your\s+)?medicine/i,
    /miracle\s+treatment/i,
    /guaranteed\s+cure/i,
    /buy\s+medicine\s+without\s+prescription/i,
    /fake\s+vaccine/i,
  ];

  const warning = [
    /take\s+\d+\s+pills/i,
    /self.?medicate/i,
    /ignore\s+doctor/i,
  ];

  for (const pattern of blocked) {
    if (pattern.test(trimmed)) {
      return {
        approved: false,
        reason:
          'This post may contain unsafe medical advice. It was not published. Please consult a verified doctor.',
      };
    }
  }

  for (const pattern of warning) {
    if (pattern.test(trimmed)) {
      return {
        approved: false,
        reason:
          'Posts about changing medication must come from verified professionals. Please rephrase or ask a doctor.',
      };
    }
  }

  return { approved: true };
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
}

module.exports = { moderatePostContent, formatTimeAgo };
