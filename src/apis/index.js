const {
  PublishLayerVersion,
  DeleteLayerVersion,
  GetLayerVersion,
  ListLayerVersions
} = require('./apis')

const utils = {
  /**
   * get target version layer detail
   * @param {object} context serverless context
   * @param {object} capi capi instance
   * @param {string} LayerName
   * @param {string} LayerVersion
   */
  async getLayerDetail(context, capi, LayerName, LayerVersion) {
    // get instance detail
    const res = await GetLayerVersion(capi, {
      LayerName,
      LayerVersion
    })

    return res
  },

  /**
   * get layer versiosn
   * @param {object} context serverless context
   * @param {object} capi capi instance
   * @param {string} LayerName
   */
  async getLayerVersions(context, capi, LayerName) {
    // get instance detail
    const res = await ListLayerVersions(capi, {
      LayerName
    })
    if (res.LayerVersions) {
      const { LayerVersions } = res
      return LayerVersions
    }
    return null
  },

  /**
   *
   * @param {object} context serverless context
   * @param {object} capi capi instance
   * @param {object} params publish layer parameters
   */
  async publishLayer(context, capi, params) {
    const res = await PublishLayerVersion(capi, {
      LayerName: params.LayerName,
      CompatibleRuntimes: params.CompatibleRuntimes,
      Content: params.Content,
      Description: params.Description,
      LicenseInfo: params.licenseInfo || ''
    })
    return res.LayerVersion ? res.LayerVersion : null
  },

  /**
   * delete layer version
   * @param {object} context serverless context
   * @param {object} capi capi instance
   * @param {*} LayerName layer name
   * @param {*} LayerVersion layer version
   */
  async deleteLayerVersion(context, capi, LayerName, LayerVersion) {
    await DeleteLayerVersion(capi, {
      LayerName,
      LayerVersion
    })
  }
}

module.exports = utils
