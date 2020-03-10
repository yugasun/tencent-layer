# Tencent Cloud Vpc Component

[简体中文](https://github.com/serverless-components/tencent-vpc/blob/master/README.md) | English

## Introduction

Tencent Cloud Vpc serverless component.

## Content

1. [Install](#1-install)
2. [Create](#2-create)
3. [Configure](#3-configure)
4. [Deploy](#4-deploy)
5. [Remove](#5-Remove)

### 1. Install

Install the Serverless Framework globally:

```bash
$ npm install -g serverless
```

### 2. Create

In project root, create the following simple boilerplate:

```bash
$ touch serverless.yml
$ touch .env           # your Tencent api keys
```

Add the access keys of a [Tencent CAM Role](https://console.cloud.tencent.com/cam/capi) with `AdministratorAccess` in the `.env` file, using this format:

```
# .env
TENCENT_SECRET_ID=XXX
TENCENT_SECRET_KEY=XXX
```

- If you don't have a Tencent Cloud account, you could [sign up](https://intl.cloud.tencent.com/register) first.

### 3. Configure

```yml
# serverless.yml
MyVpc:
  component: '@serverless/tencent-vpc'
  inputs:
    region: ap-guangzhou
    zone: ap-guangzhou-2
    vpcName: serverless
    subnetName: serverless
```

- [More Options](https://github.com/serverless-components/tencent-vpc/blob/master/docs/configure.md)

### 4. Deploy

```bash
$ sls --debug

  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Creating vpc serverless...
  DEBUG ─ Create vpc serverless success.
  DEBUG ─ Creating subnet serverless...
  DEBUG ─ Create subnet serverless success.

  MyVpc:
    region:     ap-guangzhou
    zone:       ap-guangzhou-2
    vpcName:    serverless
    subnetName: serverless
    subnetId:   subnet-kwtsloz4
    vpcId:      vpc-hqydtuy1

  5s › MyVpc › done
```

> Notice: `sls` is short for `serverless` command.

&nbsp;

### 5. Remove

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Start removing subnet subnet-kwtsloz4
  DEBUG ─ Removed subnet subnet-kwtsloz4
  DEBUG ─ Start removing vpc vpc-hqydtuy1
  DEBUG ─ Removed vpc vpc-hqydtuy1

  7s › MyVpc › done
```

### More Components

Checkout the [Serverless Components](https://github.com/serverless/components) repo for more information.
