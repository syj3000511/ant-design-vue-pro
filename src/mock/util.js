/**
 * Mock Response Builder
 * @param {any} data
 * @param {string} message
 * @param {number} code
 * @param {object} headers
 * @returns {object}
 */
export const builder = (data, message, code = 0, headers = {}) => {
  const responseBody = {
    message: message || '',
    timestamp: new Date().getTime(),
    result: data,
    code: code,
    success: code === 0 || code === 200 // Add success flag for frontend consumption
  }

  if (headers !== null && typeof headers === 'object' && Object.keys(headers).length > 0) {
    responseBody._headers = headers
  }

  // Return a fresh object to avoid singleton race conditions
  return responseBody
}

/**
 * Enhanced Query String Parser
 * @param {object} options
 * @returns {object}
 */
export const getQueryParameters = (options) => {
  const url = options.url
  const search = url.split('?')[1]
  if (!search) {
    return {}
  }

  const paramObj = {}
  const params = new URLSearchParams(search)
  params.forEach((value, key) => {
    // Attempt to parse numbers and booleans
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (!isNaN(Number(value)) && value.trim() !== '') value = Number(value)

    paramObj[key] = value
  })

  return paramObj
}

/**
 * Get Request Body
 * @param {object} options
 * @returns {any}
 */
export const getBody = (options) => {
  return options.body && JSON.parse(options.body)
}
