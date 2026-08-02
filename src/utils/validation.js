const validator = require("validator");

// Single source of truth for allowed genders (used by signup + profile edit)
const GENDERS = ["male", "female", "others"];

// Max number of tags allowed per list-style field
const MAX_ARRAY_SIZES = {
  skills: 10,
  hobbies: 5,
  likes: 5,
  dislikes: 5,
};

// Computes the user's age from a YYYY-MM-DD date of birth
const computeAgeFromDob = (dobStr) => {
  const [y, m, d] = dobStr.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

const isDobValid = (value) => {
  const raw = String(value || "").trim();
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(raw) &&
    validator.isDate(raw, { format: "YYYY-MM-DD", strictMode: true })
  );
};

const validateSignUpData = (req) => {
  // Take out the fields from req.body
  const { firstName, lastName, emailId, password, gender } = req.body;

  if (!firstName || !lastName) {
    throw new Error("Name is not valid");
  }
  // These checks are also on the Database length
  else if (firstName.length < 4 || firstName.length > 50) {
    throw new Error("First name should be 4 to 50 characters");
  } else if (!validator.isEmail(emailId)) {
    throw new Error("EmailId is not valid");
  } else if (!validator.isStrongPassword(password)) {
    throw new Error("Password is not strong");
  } else if (gender && !GENDERS.includes(gender.toLowerCase())) {
    throw new Error("Gender is not valid");
  }
};

// Fields a user is allowed to edit via PATCH /profile/edit.
// Sensitive fields (emailId, password, isPremium, membershipType, _id, timestamps)
// are intentionally NOT whitelisted — they can never be changed from the edit API.
const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "dob",
  "gender",
  "photoURL",
  "photos",
  "about",
  "skills",
  "location",
  "hobbies",
  "likes",
  "dislikes",
  "isStudent",
  "education",
  "work",
  "codingProfiles",
  "github",
  "linkedin",
  "portfolio",
  "resumeURL",
];

// Allowed sub-keys for nested fields
const NESTED_KEYS = {
  location: ["city", "country"],
  education: ["college", "degree", "passingYear", "cgpa"],
  work: ["company", "role", "experienceYears"],
  codingProfiles: [
    "leetcode",
    "gfg",
    "codeforces",
    "codechef",
    "hackerrank",
    "codingninjas",
  ],
};

const STRING_ARRAY_FIELDS = ["skills", "hobbies", "likes", "dislikes"];

// Link fields accept a full URL OR a bare handle/username (resolved client-side).
// They cannot contain spaces.
const LINK_FIELDS = ["github", "linkedin", "portfolio", "resumeURL"];

const validateProfileEditData = (req) => {
  const fields = Object.keys(req.body);

  if (fields.length === 0) {
    throw new Error("No fields provided to update");
  }

  const notEditable = fields.filter((field) => !EDITABLE_FIELDS.includes(field));
  if (notEditable.length > 0) {
    throw new Error(
      `These fields cannot be edited: ${notEditable.join(", ")}`,
    );
  }

  for (const field of fields) {
    const value = req.body[field];
    if (value === undefined || value === null) continue;

    if (STRING_ARRAY_FIELDS.includes(field)) {
      if (
        !Array.isArray(value) ||
        value.some(
          (item) =>
            typeof item !== "string" || !item.trim() || item.trim().length > 100,
        )
      ) {
        throw new Error(
          `${field} must be an array of non-empty strings (max 100 chars each)`,
        );
      }
      const maxLen = MAX_ARRAY_SIZES[field];
      if (maxLen && value.length > maxLen) {
        throw new Error(`${field} can have at most ${maxLen} items`);
      }
      continue;
    }

    if (field === "photos") {
      if (!Array.isArray(value) || value.length > 3) {
        throw new Error("photos must be an array of at most 3 images");
      }
      for (const url of value) {
        if (typeof url !== "string" || !url.trim()) {
          throw new Error("Each photo must be a valid URL");
        }
        const u = url.trim();
        if (u.length > 500) {
          throw new Error("Photo URL is too long");
        }
        if (!u.startsWith("/uploads/") && !validator.isURL(u, { require_protocol: true })) {
          throw new Error("Each photo must be a valid URL");
        }
      }
      continue;
    }

    if (NESTED_KEYS[field]) {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${field} must be an object`);
      }
      const allowed = NESTED_KEYS[field];
      const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
      if (unknown.length > 0) {
        throw new Error(
          `Invalid sub-fields in ${field}: ${unknown.join(", ")}`,
        );
      }
      for (const key of allowed) {
        const v = value[key];
        if (v === undefined || v === null || v === "") continue;
        if (typeof v !== "string" && typeof v !== "number") {
          throw new Error(`${field}.${key} is invalid`);
        }
        if (key === "passingYear") {
          const year = Number(v);
          const maxYear = new Date().getFullYear() + 5;
          if (!Number.isInteger(year) || year < 1950 || year > maxYear) {
            throw new Error(
              `passingYear must be between 1950 and ${maxYear}`,
            );
          }
        } else if (key === "cgpa") {
          const cgpa = Number(v);
          if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) {
            throw new Error("CGPA must be between 0 and 10");
          }
        } else if (key === "experienceYears") {
          const exp = Number(v);
          if (!Number.isFinite(exp) || exp < 0 || exp > 60) {
            throw new Error("experienceYears must be between 0 and 60");
          }
        } else if (typeof v === "string" && v.length > 200) {
          throw new Error(`${field}.${key} is too long`);
        }
      }
      continue;
    }

    if (field === "isStudent") {
      if (typeof value !== "boolean") {
        throw new Error("isStudent must be a boolean");
      }
      continue;
    }

    if (field === "dob") {
      if (String(value).trim() === "") continue;
      if (!isDobValid(value)) {
        throw new Error("dob must be a valid date in YYYY-MM-DD format");
      }
      const age = computeAgeFromDob(value);
      if (age < 15 || age > 100) {
        throw new Error("Age must be between 15 and 100");
      }
      continue;
    }

    if (field === "gender") {
      if (value !== "" && !GENDERS.includes(String(value).toLowerCase())) {
        throw new Error("Gender must be Male, Female or Others");
      }
      continue;
    }

    if (typeof value !== "string") {
      throw new Error(`${field} must be a string`);
    }

    if (value.length > 500) {
      throw new Error(`${field} is too long`);
    }

    if (LINK_FIELDS.includes(field) && value.includes(" ")) {
      throw new Error(`${field} cannot contain spaces`);
    }

    if (
      field === "photoURL" &&
      value &&
      !value.startsWith("/uploads/") &&
      !validator.isURL(value, { require_protocol: true })
    ) {
      throw new Error("photoURL must be a valid URL");
    }

    if (field === "firstName" && !value.trim()) {
      throw new Error("First name cannot be empty");
    }

    if (["firstName", "lastName"].includes(field) && value.length > 50) {
      throw new Error(`${field} must be at most 50 characters`);
    }
  }

  return true;
};

// Builds a clean object with only allowed fields (and only allowed nested keys),
// ready to be assigned onto the user document.
const sanitizeEditableFields = (body) => {
  const sanitized = {};

  for (const field of Object.keys(body)) {
    if (!EDITABLE_FIELDS.includes(field) || body[field] === undefined) continue;

    if (NESTED_KEYS[field]) {
      const nested = {};
      for (const key of NESTED_KEYS[field]) {
        const v = body[field][key];
        if (v === undefined || v === null || v === "") continue;
        nested[key] = typeof v === "string" ? v.trim() : Number(v);
      }
      sanitized[field] = nested;
      continue;
    }

    if (field === "gender") {
      const raw = String(body[field]);
      const lower = raw.toLowerCase();
      if (!GENDERS.includes(lower)) continue;
      sanitized[field] = lower.charAt(0).toUpperCase() + lower.slice(1);
      continue;
    }

    if (field === "dob") {
      if (!isDobValid(body[field])) continue;
      sanitized.dob = String(body[field]).trim();
      sanitized.age = computeAgeFromDob(sanitized.dob);
      continue;
    }

    if (STRING_ARRAY_FIELDS.includes(field)) {
      sanitized[field] = body[field]
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, MAX_ARRAY_SIZES[field]);
      continue;
    }

    if (field === "photos") {
      sanitized[field] = body[field]
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 3);
      continue;
    }

    if (typeof body[field] === "string") {
      const trimmed = body[field].trim();
      if (trimmed) sanitized[field] = trimmed;
      continue;
    }

    sanitized[field] = body[field];
  }

  return sanitized;
};

module.exports = {
  GENDERS,
  MAX_ARRAY_SIZES,
  computeAgeFromDob,
  validateSignUpData,
  validateProfileEditData,
  sanitizeEditableFields,
};
