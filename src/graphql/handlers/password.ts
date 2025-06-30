export const verifyPassword = (password: string) => {
  return /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{6,}$/.test(password)
}
