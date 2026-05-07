import Mock from 'mockjs2'
import { builder, getQueryParameters } from '../util'

// Initial Data
// Initial Data Generation (100 Users for testing)
const userList = []
for (let i = 1; i <= 100; i++) {
  userList.push({
    id: i,
    username: `user_${i.toString().padStart(3, '0')}`,
    nickname: `测试用户_${i}`,
    roleName: i % 3 === 0 ? '管理员' : (i % 3 === 1 ? '开发者' : '测试'),
    status: i % 10 === 0 ? 2 : 1, // 10% resigned
    email: `user${i}@xbom-tech.com`,
    avatar: '',
    updatedAt: `2023-10-${(i % 20 + 1).toString().padStart(2, '0')} 10:00:00`
  })
}

const permissionList = [
  { id: 1, name: '用户管理', permission: 'system:user:view', type: 1, description: '查看用户列表权限' },
  { id: 2, name: '添加用户', permission: 'system:user:add', type: 2, description: '添加新角色权限' },
  { id: 3, name: '重置密码', permission: 'system:user:reset-pwd', type: 2, description: '强制重置用户密码' }
]

const dictList = [
  { id: 1, name: '用户状态', type: 'user_status', remark: '系统用户状态字典', createdAt: '2023-10-20 09:00:00' },
  { id: 2, name: '角色标识', type: 'role_type', remark: '角色权限分级字典', createdAt: '2023-10-21 14:20:00' }
]

const dictItemList = [
  { id: 1, dictId: 1, label: '正常', value: '1', sort: 1, status: 1 },
  { id: 2, dictId: 1, label: '禁用', value: '2', sort: 2, status: 1 },
  { id: 3, dictId: 2, label: '系统管理', value: '1', sort: 1, status: 1 },
  { id: 4, dictId: 2, label: '业务开发', value: '2', sort: 2, status: 1 }
]

// Handlers
const getSystemUserList = (options) => {
  const parameters = getQueryParameters(options)
  const { pageNo = 1, pageSize = 10, username } = parameters
  let filteredList = userList
  if (username) {
    filteredList = userList.filter(item => item.username.includes(username))
  }
  const start = (pageNo - 1) * pageSize
  const end = pageNo * pageSize
  return builder({
    pageSize: Number(pageSize),
    pageNo: Number(pageNo),
    totalCount: filteredList.length,
    data: filteredList.slice(start, end)
  })
}

// Dict Item Handlers
const getSystemDictItemList = (options) => {
  const parameters = getQueryParameters(options)
  const { dictId } = parameters
  const filteredList = dictItemList.filter(item => item.dictId === Number(dictId))
  return builder({
    pageSize: filteredList.length,
    pageNo: 1,
    totalCount: filteredList.length,
    data: filteredList
  })
}

const saveSystemDictItem = (options) => {
  const body = JSON.parse(options.body)
  if (body.id > 0) {
    const index = dictItemList.findIndex(item => item.id === body.id)
    dictItemList[index] = { ...dictItemList[index], ...body }
  } else {
    dictItemList.push({ ...body, id: dictItemList.length + 1 })
  }
  return builder(true)
}

const deleteSystemDictItem = (options) => {
  const parameters = getQueryParameters(options)
  const id = Number(parameters.id)
  const index = dictItemList.findIndex(item => item.id === id)
  if (index > -1) {
    dictItemList.splice(index, 1)
  }
  return builder(true)
}

const saveSystemUser = (options) => {
  const body = JSON.parse(options.body)
  if (body.id > 0) {
    const index = userList.findIndex(item => item.id === body.id)
    userList[index] = { ...userList[index], ...body, updatedAt: new Date().toLocaleString() }
  } else {
    userList.push({
      ...body,
      id: userList.length + 1,
      updatedAt: new Date().toLocaleString()
    })
  }
  return builder(true)
}

const deleteSystemUser = (options) => {
  const parameters = getQueryParameters(options)
  const id = Number(parameters.id)
  const index = userList.findIndex(item => item.id === id)
  if (index > -1) {
    userList.splice(index, 1)
  }
  return builder(true)
}

// Permission Handlers
const getSystemPermissionList = (options) => {
  const parameters = getQueryParameters(options)
  const { pageNo = 1, pageSize = 10 } = parameters
  const start = (pageNo - 1) * pageSize
  const end = pageNo * pageSize
  return builder({
    pageSize: Number(pageSize),
    pageNo: Number(pageNo),
    totalCount: permissionList.length,
    data: permissionList.slice(start, end)
  })
}

const saveSystemPermission = (options) => {
  const body = JSON.parse(options.body)
  if (body.id > 0) {
    const index = permissionList.findIndex(item => item.id === body.id)
    permissionList[index] = { ...permissionList[index], ...body }
  } else {
    permissionList.push({ ...body, id: permissionList.length + 1 })
  }
  return builder(true)
}

const deleteSystemPermission = (options) => {
  const parameters = getQueryParameters(options)
  const id = Number(parameters.id)
  const index = permissionList.findIndex(item => item.id === id)
  if (index > -1) {
    permissionList.splice(index, 1)
  }
  return builder(true)
}

// Dict Handlers
const getSystemDictList = (options) => {
  const parameters = getQueryParameters(options)
  const { pageNo = 1, pageSize = 10 } = parameters
  const start = (pageNo - 1) * pageSize
  const end = pageNo * pageSize
  return builder({
    pageSize: Number(pageSize),
    pageNo: Number(pageNo),
    totalCount: dictList.length,
    data: dictList.slice(start, end)
  })
}

const saveSystemDict = (options) => {
  const body = JSON.parse(options.body)
  if (body.id > 0) {
    const index = dictList.findIndex(item => item.id === body.id)
    dictList[index] = { ...dictList[index], ...body }
  } else {
    dictList.push({ ...body, id: dictList.length + 1, createdAt: new Date().toLocaleString() })
  }
  return builder(true)
}

const deleteSystemDict = (options) => {
  const parameters = getQueryParameters(options)
  const id = Number(parameters.id)
  const index = dictList.findIndex(item => item.id === id)
  if (index > -1) {
    dictList.splice(index, 1)
  }
  return builder(true)
}

// Registration
Mock.mock(/\/api\/system\/user/, (options) => {
  const method = options.type.toLowerCase()
  if (method === 'get') return getSystemUserList(options)
  if (method === 'post' || method === 'put') return saveSystemUser(options)
  if (method === 'delete') return deleteSystemUser(options)
})

Mock.mock(/\/api\/system\/permission/, (options) => {
  const method = options.type.toLowerCase()
  if (method === 'get') return getSystemPermissionList(options)
  if (method === 'post' || method === 'put') return saveSystemPermission(options)
  if (method === 'delete') return deleteSystemPermission(options)
})
Mock.mock(/\/api\/system\/dictItem/, (options) => {
  const method = options.type.toLowerCase()
  if (method === 'get') return getSystemDictItemList(options)
  if (method === 'post' || method === 'put') return saveSystemDictItem(options)
  if (method === 'delete') return deleteSystemDictItem(options)
})

Mock.mock(/\/api\/system\/dict/, (options) => {
  const method = options.type.toLowerCase()
  if (method === 'get') return getSystemDictList(options)
  if (method === 'post' || method === 'put') return saveSystemDict(options)
  if (method === 'delete') return deleteSystemDict(options)
})
