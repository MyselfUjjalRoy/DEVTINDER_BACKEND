const USER_SAFE_DATA =
  "firstName lastName photoURL photos age gender about skills " +
  "location hobbies likes dislikes isStudent education work " +
  "codingProfiles github linkedin portfolio resumeURL membershipType isPremium";

const toSafeUser = (user) => {
  if (!user) return null;
  const safe = {};
  USER_SAFE_DATA.split(" ").forEach((field) => {
    safe[field] = user[field];
  });
  safe._id = user._id;
  return safe;
};

module.exports = { USER_SAFE_DATA, toSafeUser };
