const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const archiver = require('archiver')
const globby = require('globby')
const { createReadStream, createWriteStream } = require('fs-extra')

const VALID_FORMATS = ['zip', 'tar']
const isValidFormat = (format) => VALID_FORMATS.indexOf(format) !== -1
const isNil = (obj) => obj == null
const fileExt = (filename) => {
  const arr = filename.split('.')
  if (arr.length > 0) {
    return arr[arr.length - 1]
  }
  return ''
}

module.exports = {
  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  },

  async packDir(inputDirPath, outputFilePath, include = [], exclude = [], prefix) {
    const format = fileExt(outputFilePath)

    if (!isValidFormat(format)) {
      throw new Error('Please provide a valid format. Either a "zip" or a "tar"')
    }

    const patterns = ['**']

    if (!isNil(exclude)) {
      exclude.forEach((excludedItem) => patterns.push(`!${excludedItem}`))
    }

    const files = (await globby(patterns, { cwd: inputDirPath, dot: true }))
      .sort() // we must sort to ensure correct hash
      .map((file) => ({
        input: path.join(inputDirPath, file),
        output: prefix ? path.join(prefix, file) : file
      }))

    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputFilePath)
      const archive = archiver(format, {
        zlib: { level: 9 }
      })

      output.on('open', async () => {
        archive.pipe(output)

        // we must set the date to ensure correct hash
        files.forEach((file) =>
          archive.append(createReadStream(file.input), { name: file.output, date: new Date(0) })
        )

        if (!isNil(include)) {
          for (let i = 0, len = include.length; i < len; i++) {
            const curInclude = include[i]
            if (fs.statSync(curInclude).isDirectory()) {
              // if is relative directory, we should join with process.cwd
              const curPath = path.isAbsolute(curInclude)
                ? curInclude
                : path.join(process.cwd(), curInclude)
              const includeFiles = await globby(patterns, { cwd: curPath, dot: true })
              includeFiles
                .sort()
                .map((file) => ({
                  input: path.join(curPath, file),
                  output: prefix ? path.join(prefix, file) : file
                }))
                .forEach((file) =>
                  archive.append(createReadStream(file.input), {
                    name: file.output,
                    date: new Date(0)
                  })
                )
            } else {
              const stream = createReadStream(curInclude)
              archive.append(stream, { name: path.basename(curInclude), date: new Date(0) })
            }
          }
        }

        archive.finalize()
      })

      archive.on('error', (err) => reject(err))
      output.on('close', () => resolve(outputFilePath))
    })
  },

  getHash(content, encoding, type) {
    return crypto
      .createHash(type)
      .update(content, encoding)
      .digest('hex')
  },
  getFileHash(filePath) {
    return this.getHash(fs.readFileSync(filePath, 'utf8'), 'utf8', 'md5')
  }
}
