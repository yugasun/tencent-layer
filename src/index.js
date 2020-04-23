const { Component } = require('@serverless/core')
const { Capi } = require('@tencent-sdk/capi')
const tencentAuth = require('serverless-tencent-auth-tool')
const ensureIterable = require('type/iterable/ensure')
const ensureObject = require('type/object/ensure')
const cliProgress = require('cli-progress')
const ensureString = require('type/string/ensure')
const { zipDirectory, fileHash } = require('@ygkit/file')
const path = require('path')

const apis = require('./apis')
const Layer = require('./libs/layer')

class TencentLayer extends Component {
  async initCredential(inputs, action) {
    // login
    const auth = new tencentAuth()
    this.context.credentials.tencent = await auth.doAuth(this.context.credentials.tencent, {
      client: 'tencent-layer',
      remark: inputs.fromClientRemark,
      project: this.context.instance ? this.context.instance.id : undefined,
      action: action
    })
    if (this.context.credentials.tencent && this.context.credentials.tencent.token) {
      this.context.credentials.tencent.Token = this.context.credentials.tencent.token
    }
  }

  layerStateChange({ newState, oldState }) {
    // 1. code change
    // 2. layer name change
    // 3. region change
    // 4. runtime change
    newState.version = oldState.version
    return JSON.stringify(newState) !== JSON.stringify(oldState)
  }

  async default(inputs = {}) {
    const { context } = this
    await this.initCredential(inputs, 'default')
    const tencentCredentials = context.credentials.tencent
    context.status('Deploying')

    const { forcePublish } = inputs
    const layerConf = {}
    layerConf.src = ensureString(inputs.src) || process.cwd()
    layerConf.name = ensureString(inputs.name, { default: 'layer_' })
    layerConf.zipFilename = ensureString(inputs.zipFilename, {
      default: path.basename(layerConf.src)
    })
    layerConf.region = ensureString(inputs.region, { default: 'ap-guangzhou' })
    layerConf.disableTraverse = ensureString(inputs.disableTraverse, { default: false })
    layerConf.description = ensureString(inputs.description, {
      default: 'Layer created by serverless component'
    })
    layerConf.runtimes = ensureIterable(inputs.runtimes, {
      default: ['Nodejs8.9'],
      ensureItem: ensureString
    })
    layerConf.include = ensureIterable(inputs.include, { default: [], ensureItem: ensureString })
    layerConf.exclude = ensureIterable(inputs.exclude, { default: [], ensureItem: ensureString })
    layerConf.bucketConf = ensureObject(inputs.bucketConf, { default: {} })

    const defaultExclude = ['.serverless', '.temp_env', '.env', '.git/**', '.gitignore']
    defaultExclude.forEach((item) => {
      if (layerConf.exclude.indexOf(item) === -1) {
        layerConf.exclude.push(item)
      }
    })

    const capi = new Capi({
      Region: layerConf.region,
      AppId: tencentCredentials.AppId,
      SecretId: tencentCredentials.SecretId,
      SecretKey: tencentCredentials.SecretKey
    })

    const oldState = this.state

    const outputs = {
      region: layerConf.region,
      name: layerConf.name,
      zipFilename: layerConf.zipFilename,
      description: layerConf.description,
      runtimes: layerConf.runtimes,
      licenseInfo: layerConf.licenseInfo || ''
    }

    const layer = new Layer({
      inputs: layerConf,
      appId: tencentCredentials.AppId,
      secretId: tencentCredentials.SecretId,
      secretKey: tencentCredentials.SecretKey,
      cosOptions: {
        region: layerConf.region,
        timestamp: tencentCredentials.timestamp || null,
        token: tencentCredentials.token || null
      }
    })

    const { Content } = layer.resource
    const cosBucketName = Content.CosBucketName
    const cosBucketKey = Content.CosObjectName

    // get target vesion layer
    let exist = false
    if (oldState.version) {
      const res = await apis.getLayerDetail(context, capi, layerConf.name, oldState.version)
      exist = !!res.LayerVersion
    }

    const configChange = this.layerStateChange({
      newState: outputs,
      oldState: {
        region: oldState.region,
        name: oldState.name,
        zipFilename: oldState.zipFilename,
        description: oldState.description,
        runtimes: oldState.runtimes,
        licenseInfo: oldState.licenseInfo || ''
      }
    })

    if (!exist || forcePublish === true || configChange) {
      if (!layerConf.bucketConf.key) {
        // packDir
        const zipOutput = `${context.instance.stateRoot}/${layerConf.zipFilename}.zip`
        context.debug(`Compressing layer ${layerConf.name} file to ${zipOutput}.`)
        await zipDirectory(
          layerConf.src,
          zipOutput,
          layerConf.include,
          layerConf.exclude,
          layerConf.disableTraverse
        )
        context.debug(`Compressed layer ${layerConf.name} file successful`)

        // check code hash, if not change, just updata function configure
        const layerHash = fileHash(zipOutput)
        outputs.hash = layerHash

        let needUpdateCode = layerHash !== oldState.hash

        // upload to cos
        // 判断是否需要上传代码
        if (!needUpdateCode && this.state.bucketName && this.state.bucketKey) {
          const objectExist = await layer.getObject(
            `${this.state.bucketName}-${tencentCredentials.AppId}`,
            this.state.bucketKey
          )
          if (!objectExist) {
            needUpdateCode = true
          } else {
            layer.resource.Content.CosBucketName = this.state.bucketName
            layer.resource.Content.CosObjectName = this.state.bucketKey
          }
        } else {
          needUpdateCode = true
        }

        if (needUpdateCode) {
          context.debug(`Uploading layer package to cos[${cosBucketName}]. ${cosBucketKey}`)
          // display upload bar
          if (!context.instance.multiBar) {
            context.instance.multiBar = new cliProgress.MultiBar(
              {
                forceRedraw: true,
                hideCursor: true,
                linewrap: true,
                clearOnComplete: false,
                format: `  {filename} [{bar}] {percentage}% | ETA: {eta}s | Speed: {speed}k/s`,
                speed: 'N/A'
              },
              cliProgress.Presets.shades_grey
            )
            context.instance.multiBar.count = 0
          }
          const uploadBar = context.instance.multiBar.create(100, 0, {
            filename: `[Layer] ${layerConf.name}`
          })

          context.instance.multiBar.count += 1
          const onProgress = ({ percent, speed }) => {
            const percentage = Math.round(percent * 100)

            if (percent === 1) {
              uploadBar.update(100, {
                speed: (speed / 1024).toFixed(2)
              })
              setTimeout(() => {
                context.instance.multiBar.remove(uploadBar)
                context.instance.multiBar.count -= 1
                if (context.instance.multiBar.count <= 0) {
                  context.instance.multiBar.stop()
                }
              }, 300)
            } else {
              uploadBar.update(percentage, {
                speed: (speed / 1024).toFixed(2)
              })
            }
          }

          const autoCreateBucket = !layerConf.bucketConf.key && !layerConf.bucketConf.bucket
          await layer.uploadPackage2Cos(
            cosBucketName,
            cosBucketKey,
            zipOutput,
            onProgress,
            autoCreateBucket
          )
          context.debug(`Uploaded package successful ${zipOutput}`)
        }
      }
      // publish layer
      this.context.debug(`Creating layer ${layerConf.name}`)

      const version = await apis.publishLayer(context, capi, layer.resource)

      context.debug(`Created layer: ${layerConf.name}, version: ${version} successful`)
      outputs.version = version
    } else {
      context.debug(`Layer ${layerConf.name}, version: ${oldState.version} exist.`)
      outputs.version = oldState.version
    }

    outputs.bucketName = cosBucketName
    outputs.bucketKey = cosBucketKey

    this.state = outputs
    await this.save()

    return outputs
  }

  async remove(inputs = {}) {
    const { context } = this
    await this.initCredential(inputs, 'remove')
    const tencentCredentials = context.credentials.tencent

    const { state } = this
    const { region } = state
    context.status('Removing')

    const capi = new Capi({
      Region: region,
      AppId: tencentCredentials.AppId,
      SecretId: tencentCredentials.SecretId,
      SecretKey: tencentCredentials.SecretKey
    })

    try {
      context.debug(`Start removing layer: ${state.name}, version: ${state.version}...`)
      await apis.deleteLayerVersion(context, capi, state.name, state.version)
      context.debug(`Remove layer: ${state.name}, version: ${state.version} successfully`)
      this.state = {}
      await this.save()
    } catch (e) {
      context.debug(e)
    }

    return {}
  }
}

module.exports = TencentLayer
