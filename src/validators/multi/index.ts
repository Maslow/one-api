import { Handler } from '../../processor'
import { ActionType } from "../../types"
import { execScript } from '../utils'

export const MultiHandler: Handler = async function (config, context){

    const { query, multi, data, action } = context.params

    let allow_multi = false

    // 读操作默认开启 multi
    if(action === ActionType.READ) {
        allow_multi = true
    }

    // 布尔值配置方式
    if([true, false].includes(config)) {
        allow_multi = config
    }

    // 字符串代表表达式
    if(typeof config === 'string') {
        const { injections } = context
        const global = {
            ...injections,
            query,
            data,
            multi
        }
        const result = execScript(config, global)
        allow_multi = result ? true : false
    }


    if(action === ActionType.ADD) {
        // 要插入的数据是数组，但传入的 multi 却是假值
        if((data instanceof Array) && !multi) {
            return 'multi insert operation denied'
        }
    }


    // 规则允许，则直接通过
    if(allow_multi) {
        return null
    }


    // 规则不允许 multi 且不匹配则拒绝
    if(!allow_multi && multi) {
        return 'multi operation denied'
    }


    return null
}