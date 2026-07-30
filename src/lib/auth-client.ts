"use client";

// AC-3/AC-8 client-side fallback: if a protected API call ever comes back 401
// (session expired, or the account was deactivated mid-session), send the
// user to the login page instead of leaving them on a broken protected page.
export async function authFetch(input: string, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return res;
}
