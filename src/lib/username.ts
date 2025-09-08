// src/lib/username.ts
export const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;

export function validateUsernameLocal(name: string): string | null {
  if (!USERNAME_REGEX.test(name)) {
    return "3〜30文字の半角英数・._ が使えます（大文字不可）";
  }
  return null;
}
