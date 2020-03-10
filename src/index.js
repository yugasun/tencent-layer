const { Component } = require('@serverless/core')
const { Capi } = require('@tencent-sdk/capi')
const tencentAuth = require('serverless-tencent-auth-tool')
const ensureIterable = require('type/iterable/ensure')
const cliProgress = require('cli-progress')
const ensureString = require('type/string/ensure')

const apis = require('./apis')
const Zipper = require('./libs/zip')
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
    layerConf.code = ensureString(inputs.code) || process.cwd()
    layerConf.name = ensureString(inputs.name)
    layerConf.region = ensureString(inputs.region, { default: 'ap-guangzhou' })
    layerConf.description = ensureString(inputs.description, {
      default: 'Layer created by tencent-layer component'
    })
    layerConf.runtimes = ensureIterable(inputs.runtimes, {
      default: ['Nodejs8.9'],
      ensureItem: ensureString
    })
    layerConf.include = ensureIterable(inputs.include, { default: [], ensureItem: ensureString })
    layerConf.exclude = ensureIterable(inputs.exclude, { default: [], ensureItem: ensureString })

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

    // packDir
    const zipOutput = `${context.instance.stateRoot}/${layerConf.name}-layer.zip`
    context.debug(`Compressing layer ${layerConf.name} file to ${zipOutput}.`)
    await Zipper.packDir(layerConf.code, zipOutput, layerConf.include, layerConf.exclude)
    context.debug(`Compressed layer ${layerConf.name} file successful`)

    // check code hash, if not change, just updata function configure
    const layerHash = Zipper.getFileHash(zipOutput)

    outputs.hash = layerHash
    const needUpdateCode = this.layerStateChange({
      newState: outputs,
      oldState
    })

    // get target vesion layer
    let exist = false
    if (oldState.version) {
      const res = await apis.getLayerDetail(context, capi, layerConf.name, oldState.version)
      exist = !!res.LayerVersion
    }

    if (needUpdateCode || !exist || forcePublish === true) {
      // upload to cos
      const { Content } = layer.resource
      const cosBucketName = Content.CosBucketName
      const cosBucketKey = Content.CosObjectName

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
        filename: layerConf.name
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
      await layer.uploadPackage2Cos(cosBucketName, cosBucketKey, zipOutput, onProgress)
      context.debug(`Uploaded package successful ${zipOutput}`)

      // publish layer
      this.context.debug(`Creating layer ${layerConf.name}`)
      const version = await apis.publishLayer(context, capi, layer.resource)

      context.debug(`Created layer: ${layerConf.name}, version: ${version} successful`)
      outputs.version = version
    } else {
      context.debug(`Layer ${layerConf.name}, version: ${oldState.version} exist.`)
      outputs.version = oldState.version
    }

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

    this.state = {}
    await this.save()
    return {}
  }
}

module.exports = TencentLayer