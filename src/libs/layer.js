const fs = require('fs')
const util = require('util')
const COS = require('cos-nodejs-sdk-v5')

class Layer {
  constructor({ inputs, prefix, appId, secretId, secretKey, cosOptions = {} }) {
    this.inputs = inputs
    this.prefix = prefix || 'sls-cloudlayer'
    this.appId = appId
    this.cosClient = Layer.createCosClient(secretId, secretKey, cosOptions)
    this.resource = this.getLayerResource(inputs)
  }

  static createCosClient(secret_id, secret_key, options) {
    const fileParallelLimit = options.fileParallelLimit || 5
    const chunkParallelLimit = options.chunkParallelLimit || 8
    const chunkSize = options.chunkSize || 1024 * 1024 * 8
    const timeout = options.timeout || 60

    return new COS({
      SecretId: secret_id,
      SecretKey: secret_key,
      FileParallelLimit: fileParallelLimit,
      ChunkParallelLimit: chunkParallelLimit,
      ChunkSize: chunkSize,
      Timeout: timeout * 1000,
      TmpSecretId: secret_id,
      TmpSecretKey: secret_key,
      XCosSecurityToken: options.token,
      ExpiredTime: options.timestamp
    })
  }

  get region() {
    return this.inputs.region || 'ap-guangzhou'
  }

  getBucketKey(layerName) {
    const nowDate = new Date()
    const timestamp = parseInt(nowDate.getTime() / 1000)
    return `${this.prefix}-${layerName}-${timestamp}.zip`
  }

  getCosBucketName(name) {
    return `${this.prefix}-${this.region}-${name || 'layer'}`
  }

  getLayerResource(layerObject) {
    const layerResource = {
      Content: {
        CosBucketName: layerObject.bucketConf.bucket || this.getCosBucketName(),
        CosObjectName: layerObject.bucketConf.object || this.getBucketKey(layerObject.name)
      },
      Description: layerObject.description || 'Layer created by serverless component',
      Region: layerObject.region || 'ap-guangzhou',
      CompatibleRuntimes: layerObject.runtimes || ['Nodejs8.9'],
      LayerName: layerObject.name
    }

    return layerResource
  }

  async getObject(bucketName, key) {
    const { region } = this.inputs
    const headObjectArgs = {
      Bucket: bucketName,
      Key: key,
      Region: region
    }
    const handler = util.promisify(this.cosClient.headObject.bind(this.cosClient))
    try {
      await handler(headObjectArgs)
      return true
    } catch (e) {
      return false
    }
  }

  async uploadPackage2Cos(bucketName, key, filePath, onProgress, autoCreate) {
    let handler
    const { region } = this
    const cosBucketNameFull = util.format('%s-%s', bucketName, this.appId)

    if (autoCreate === true) {
      // get region all bucket list
      let buckets
      handler = util.promisify(this.cosClient.getService.bind(this.cosClient))
      try {
        buckets = await handler({ Region: region })
      } catch (e) {
        throw e
      }

      const [findBucket] = buckets.Buckets.filter((item) => {
        return item.Name === cosBucketNameFull
      })

      // create a new bucket
      if (!findBucket) {
        const putArgs = {
          Bucket: cosBucketNameFull,
          Region: region
        }
        handler = util.promisify(this.cosClient.putBucket.bind(this.cosClient))
        try {
          await handler(putArgs)
        } catch (e) {
          throw e
        }
      }

      // 设置Bucket生命周期
      try {
        let tempLifeCycle
        handler = util.promisify(this.cosClient.getBucketLifecycle.bind(this.cosClient))
        const lifeCycleSetting = await handler({
          Bucket: cosBucketNameFull,
          Region: region
        })
        for (let i = 0; i < lifeCycleSetting.Rules.length; i++) {
          if (lifeCycleSetting.Rules[i].ID == 'deleteObject') {
            tempLifeCycle = true
            break
          }
        }
        if (!tempLifeCycle) {
          const putArgs = {
            Bucket: cosBucketNameFull,
            Region: region,
            Rules: [
              {
                Status: 'Enabled',
                ID: 'deleteObject',
                Filter: '',
                Expiration: { Days: '10' },
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: '10' }
              }
            ],
            stsAction: 'cos:PutBucketLifeCycle'
          }
          handler = util.promisify(this.cosClient.putBucketLifecycle.bind(this.cosClient))
          await handler(putArgs)
        }
      } catch (e) {}
    }

    if (fs.statSync(filePath).size <= 10 * 1024 * 1024) {
      const objArgs = {
        Bucket: cosBucketNameFull,
        Region: region,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentLength: fs.statSync(filePath).size,
        onProgress
      }
      handler = util.promisify(this.cosClient.putObject.bind(this.cosClient))
      try {
        await handler(objArgs)
      } catch (e) {
        throw e
      }
    } else {
      const sliceArgs = {
        Bucket: cosBucketNameFull,
        Region: region,
        Key: key,
        FilePath: filePath,
        onProgress
      }
      handler = util.promisify(this.cosClient.sliceUploadFile.bind(this.cosClient))
      try {
        await handler(sliceArgs)
      } catch (e) {
        throw e
      }
    }
    return {
      CosBucketName: bucketName,
      CosObjectName: '/' + key
    }
  }
}

module.exports = Layer
