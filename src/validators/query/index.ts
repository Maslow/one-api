import { Handler } from '../../processor'
import { validateField } from './validate'
import { isAllowedFields } from '../utils'

export const QueryHandler: Handler = async function (config, context){

    const { query } = context.params

    if(!query) return 'query is undefined'
    if(typeof query !== 'object') return 'query must be an object'

    const fields = Object.keys(query)
    let allow_fields = []

    // 数组代表只允许出现的字段
    if(config instanceof Array){
        allow_fields = config
        const error = isAllowedFields(fields, allow_fields)
        return error
    }

    if(typeof config === 'object'){
        allow_fields = Object.keys(config)
        let error = isAllowedFields(fields, allow_fields)
        if(error) return error

        for(let field of allow_fields){
            error = await validateField(field, query, config[field], context)
            if(error) return error
        }
        return null
    }
    
    return 'config error: config must be an array or object'
}