export const getIntersection = <T>(set1: Set<T>, set2: Set<T>) => {
  const ans = new Set<T>()
  for (const i of set2) {
    if (set1.has(i)) {
      ans.add(i)
    }
  }
  return ans
}
