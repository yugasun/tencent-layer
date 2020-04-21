const generateId = () =>
  Math.random()
    .toString(36)
    .substring(6)

module.exports = {
  generateId
}
