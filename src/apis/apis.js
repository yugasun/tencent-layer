function HttpError(code, message) {
  this.code = code || 0
  this.message = message || ''
}

HttpError.prototype = Error.prototype

function apiFactory(actions) {
  const apis = {}
  actions.forEach((action) => {
    apis[action] = async (capi, inputs) => {
      const data = {
        Version: '2018-04-16',
        Action: action,
        // RequestClient: 'ServerlessComponent',
        ...inputs
      }
      if (capi.options.Token) {
        data.Token = capi.options.Token
      }
      try {
        const { Response } = await capi.request(
          data,
          // this is preset options for capiateway
          {
            debug: false,
            ServiceType: 'scf',
            // baseHost: 'tencentcloudapi.com'
            host: 'scf.tencentcloudapi.com'
          },
          true
        )

        if (Response && Response.Error && Response.Error.Code) {
          throw new HttpError(
            Response.Error.Code,
            `RequestId: ${Response.RequestId}: ${Response.Error.Message}`
          )
        }
        return Response
      } catch (e) {
        throw new HttpError(500, e.message)
      }
    }
  })

  return apis
}

const ACTIONS = [
  'PublishLayerVersion',
  'DeleteLayerVersion',
  'GetLayerVersion',
  'ListLayers',
  'ListLayerVersions'
]
const APIS = apiFactory(ACTIONS)

module.exports = APIS
