import {
  CreateDCABotInput,
  CreateComboBotInput,
  CreateGridBotInput,
} from '../../../../../types'
import { ValidationResult } from './config'
import {
  validateCreateDCABotInputSchema,
  validateCreateComboBotInputSchema,
  validateCreateTerminalDealInputSchema,
  validateCreateGridBotInputSchema,
} from '../schema'
import {
  validateCreateComboBotInputLogic,
  validateCreateDCABotInputLogic,
  validateCreateTerminalDealInputLogic,
  validateCreateGridBotInputLogic,
} from '../logic'
import { CreateDCABotInputRaw, CreateGridBotInputRaw } from '../../api'

export const validateCreateDCABotInput = async (
  input: CreateDCABotInput,
  originalInput: CreateDCABotInputRaw,
  userId: string,
): Promise<ValidationResult<CreateDCABotInput>> => {
  const schemaResult = validateCreateDCABotInputSchema(input, originalInput)
  if (!schemaResult.valid) {
    return schemaResult
  }
  return await validateCreateDCABotInputLogic(input, originalInput, userId)
}

export const validateCreateTerminalDealInput = async (
  input: CreateDCABotInput,
  originalInput: CreateDCABotInputRaw,
  userId: string,
): Promise<ValidationResult<CreateDCABotInput>> => {
  const schemaResult = validateCreateTerminalDealInputSchema(
    input,
    originalInput,
  )
  if (!schemaResult.valid) {
    return schemaResult
  }
  return await validateCreateTerminalDealInputLogic(
    input,
    originalInput,
    userId,
  )
}

export const validateCreateComboBotInput = async (
  input: CreateComboBotInput,
  originalInput: CreateDCABotInputRaw, // Combo uses same raw input type
  userId: string,
): Promise<ValidationResult<CreateComboBotInput>> => {
  const schemaResult = validateCreateComboBotInputSchema(input, originalInput)
  if (!schemaResult.valid) {
    return schemaResult
  }
  // Combo bot can reuse DCA logic validation since it extends DCA
  return await validateCreateComboBotInputLogic(input, originalInput, userId)
}

export const validateCreateGridBotInput = async (
  input: CreateGridBotInput,
  originalInput: CreateGridBotInputRaw,
): Promise<ValidationResult<CreateGridBotInput>> => {
  const schemaResult = validateCreateGridBotInputSchema(input, originalInput)
  if (!schemaResult.valid) {
    return schemaResult
  }
  return await validateCreateGridBotInputLogic(input)
}
