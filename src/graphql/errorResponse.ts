import { StatusEnum } from '../../types'

export const findUserNotOk = () => ({
  status: StatusEnum.notok,
  reason: `Something went wrong while trying to find the user`,
  data: null,
})
export const userNotFoundById = () => ({
  status: StatusEnum.notok,
  reason: `No user with such id found`,
  data: null,
})

export const updateUserError = () => ({
  status: StatusEnum.notok,
  reason: `Something went wrong while trying to update the user`,
  data: null,
})

export const findUserActiveBotsNotOk = () => ({
  status: StatusEnum.notok,
  reason: `Something went wrong while trying to find users' active bots`,
  data: null,
})
export const findUserActiveComboBotsNotOk = () => ({
  status: StatusEnum.notok,
  reason: `Something went wrong while trying to find users' active bots`,
  data: null,
})
export const findUserActiveBotsNotFoundByUserId = () => ({
  status: StatusEnum.notok,
  reason: `No users' active bots found`,
  data: null,
})
export const findUserActiveComboBotsNotFoundByUserId = () => ({
  status: StatusEnum.notok,
  reason: `No users' active bots found`,
  data: null,
})

export const insufficientFunds = () => ({
  status: StatusEnum.notok,
  reason: `Insufficient funds`,
  data: null,
})

export const errorAccess = () => ({
  status: StatusEnum.notok,
  reason: 'Cannot access',
})
