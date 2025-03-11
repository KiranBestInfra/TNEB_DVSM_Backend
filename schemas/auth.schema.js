import Joi from 'joi';

const authSchemas = {
    login: Joi.object({
        email: Joi.alternatives()
            .try(
                Joi.string().email().trim().lowercase().messages({
                    'string.email': 'Please provide a valid email address',
                    'string.empty': 'Email or Name is required',
                    'any.required': 'Email or Name is required',
                }),
                Joi.string().min(3).max(30).trim().messages({
                    'string.min':
                        'Name must be at least {#limit} characters long',
                    'string.max': 'Name cannot exceed {#limit} characters',
                    'string.empty': 'Email or Name is required',
                    'any.required': 'Email or Name is required',
                })
            )
            .required()
            .messages({
                'any.required': 'Email or Name is required',
            }),

        password: Joi.string()
            .min(8)
            .max(72)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
            .required()
            .messages({
                'string.empty': 'Password is required',
                'string.min':
                    'Password must be at least {#limit} characters long',
                'string.max': 'Password cannot exceed {#limit} characters',
                'string.pattern.base':
                    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
                'any.required': 'Password is required',
            }),
        rememberMe: Joi.boolean().default(false).optional(),
    }),

    register: Joi.object({
        name: Joi.string().required().min(2).max(50).trim().messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least {#limit} characters long',
            'string.max': 'Name cannot exceed {#limit} characters',
            'any.required': 'Name is required',
        }),
        email: Joi.string().email().required().trim().lowercase().messages({
            'string.email': 'Please provide a valid email address',
            'string.empty': 'Email is required',
            'any.required': 'Email is required',
        }),
        password: Joi.string()
            .required()
            .min(8)
            .max(72) // bcrypt max length
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
            )
            .messages({
                'string.empty': 'Password is required',
                'string.min':
                    'Password must be at least {#limit} characters long',
                'string.max': 'Password cannot exceed {#limit} characters',
                'string.pattern.base':
                    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
                'any.required': 'Password is required',
            }),
        confirmPassword: Joi.string()
            .valid(Joi.ref('password'))
            .required()
            .messages({
                'any.only': 'Passwords must match',
                'any.required': 'Password confirmation is required',
            }),
    }),

    forgotPassword: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
    }),

    resetPassword: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
        token: Joi.string().required().length(64).messages({
            'any.required': 'Reset token is required',
            'string.length': 'Invalid reset token format',
        }),
        newPassword: Joi.string()
            .required()
            .min(8)
            .max(128)
            .pattern(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
            )
            .messages({
                'string.min': 'Password must be at least 8 characters long',
                'string.max': 'Password cannot exceed 128 characters',
                'string.pattern.base':
                    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
                'any.required': 'New password is required',
            }),
        confirmPassword: Joi.string()
            .valid(Joi.ref('newPassword'))
            .required()
            .messages({
                'string.empty': 'Confirm password is required',
                'any.only': 'Passwords must match',
                'any.required': 'Password confirmation is required',
            }),
    }),
};

export { authSchemas };
