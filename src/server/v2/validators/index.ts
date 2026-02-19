import { CreateDCABotInput } from '../../../../types'
import { validateCreateDCABotInputSchema, ValidationResult } from './schema'
import { validateCreateDCABotInputLogic } from './logic'
import { CreateDCABotInputRaw } from '../api'

export const validateCreateDCABotInput = async (
  input: CreateDCABotInput,
  originalInput: CreateDCABotInputRaw,
  userId: string,
): Promise<ValidationResult> => {
  const schemaResult = validateCreateDCABotInputSchema(input)
  if (!schemaResult.valid) {
    return schemaResult
  }
  return await validateCreateDCABotInputLogic(input, originalInput, userId)
}
