# Configure document

## Complete configuration

```yml
# serverless.yml

MyLayer:
  component: '@serverless/tencent-layer'
  inputs:
    name: test
    src: ./
    runtimes:
      - Nodejs8.9
    description: test project layer
    include:
      - ./**/include_modules
    exclude:
      - ./node_modules/bin
    forcePublish: false
    disableTraverse: false
```

## Configuration description

Main param description

| Param           | Required/Optional | Type    | Default         | Description                                                          |
| --------------- | ----------------- | ------- | --------------- | -------------------------------------------------------------------- |
| region          | Required          | String  |                 | Layer Region                                                         |
| name            | Required          | String  |                 | Layer name                                                           |
| src             | Required          | String  | `process.cwd()` | Layer code folder                                                    |
| exclude         | Optional          | Array   |                 | exclude file                                                         |
| include         | Optional          | Array   |                 | include file, if relative path, should relative to `serverless.yml`  |
| forcePublish    | Optional          | Boolean | false           | Whether layer change or exist, force to publish a new version        |
| disableTraverse | Optional          | Boolean | false           | Disable traverse files when packing, this is ussful for quickly pack |
