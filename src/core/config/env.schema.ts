import * as Joi from 'joi';

export const envMapping = () => ({
  NODE_ENV: process.env.NODE_ENV,
  APP_PORT: process.env.APP_PORT,
  APP_EMAIL: process.env.APP_EMAIL,
  APP_EMAIL_PASSWORD: process.env.APP_EMAIL_PASSWORD,
  APP_FRONTEND_HOST: process.env.APP_FRONTEND_HOST,

  // DB admin (multitenancy)
  ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,

  // Sankhya — caminhos dos serviços (iguais para todos os tenants)
  SNK_LOAD_RECORDS: process.env.SNK_LOAD_RECORDS,
  SNK_LOAD_VIEW: process.env.SNK_LOAD_VIEW,
  SNK_EXECUTE_QUERY: process.env.SNK_EXECUTE_QUERY,
  SNK_LOGIN: process.env.SNK_LOGIN,
  SNK_SAVE: process.env.SNK_SAVE,
});

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('dev', 'hml', 'prod').default('dev'),
  APP_PORT: Joi.number().default(3000),
  APP_EMAIL: Joi.string().required(),
  APP_EMAIL_PASSWORD: Joi.string().required(),
  APP_FRONTEND_HOST: Joi.string().uri().required(),

  ADMIN_DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().required(),

  SNK_LOAD_RECORDS: Joi.string().required(),
  SNK_LOAD_VIEW: Joi.string().required(),
  SNK_EXECUTE_QUERY: Joi.string().required(),
  SNK_LOGIN: Joi.string().required(),
  SNK_SAVE: Joi.string().required(),
});
