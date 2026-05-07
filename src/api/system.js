import request from '@/utils/request'

const api = {
  user: '/api/system/user',
  permission: '/api/system/permission',
  dict: '/api/system/dict',
  dictItem: '/api/system/dictItem'
}

/**
 * User Management
 */
export function getSystemUserList (parameter) {
  return request({
    url: api.user,
    method: 'get',
    params: parameter
  })
}

export function saveSystemUser (parameter) {
  return request({
    url: api.user,
    method: parameter.id > 0 ? 'put' : 'post',
    data: parameter
  })
}

export function deleteSystemUser (parameter) {
  return request({
    url: api.user,
    method: 'delete',
    params: parameter
  })
}

/**
 * Permission Management
 */
export function getSystemPermissionList (parameter) {
  return request({
    url: api.permission,
    method: 'get',
    params: parameter
  })
}

export function saveSystemPermission (parameter) {
  return request({
    url: api.permission,
    method: parameter.id > 0 ? 'put' : 'post',
    data: parameter
  })
}

export function deleteSystemPermission (parameter) {
  return request({
    url: api.permission,
    method: 'delete',
    params: parameter
  })
}

/**
 * Dict Management
 */
export function getSystemDictList (parameter) {
  return request({
    url: api.dict,
    method: 'get',
    params: parameter
  })
}

export function saveSystemDict (parameter) {
  return request({
    url: api.dict,
    method: parameter.id > 0 ? 'put' : 'post',
    data: parameter
  })
}

export function deleteSystemDict (parameter) {
  return request({
    url: api.dict,
    method: 'delete',
    params: parameter
  })
}

/**
 * Dict Item Management
 */
export function getSystemDictItemList (parameter) {
  return request({
    url: api.dictItem,
    method: 'get',
    params: parameter
  })
}

export function saveSystemDictItem (parameter) {
  return request({
    url: api.dictItem,
    method: parameter.id > 0 ? 'put' : 'post',
    data: parameter
  })
}

export function deleteSystemDictItem (parameter) {
  return request({
    url: api.dictItem,
    method: 'delete',
    params: parameter
  })
}
