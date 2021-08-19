const fs = require('fs');
const _ = require('lodash');
const yaml = require('yaml');
const glob = require('glob');
const child_process = require('child_process');

// if (fs.existsSync("_bakkesmod_sdk")) {
//     fs.rmdirSync("_bakkesmod_sdk", {
//         recursive: true
//     });
// }
// child_process.execSync("git clone https://github.com/bakkesmodorg/BakkesModSDK.git ./_bakkesmod_sdk");

let TagsToCreate = {};
let foundDefs = {
    Enums: {},
    Constants: {},
    Functions: {},
    Classes: {},
    Types: {},
};

let skipFiles = [
    "_bakkesmod_sdk/include/bakkesmod/wrappers/arraywrapper.h"
];

let files = glob.sync("_bakkesmod_sdk/include/bakkesmod/**/*.h");
_.each(files, file => {
    if (skipFiles.some(x => x === file)) {
        return;
    }

    const tokenRegexes = {
        defineConstants: {Rgx: /#define\s+(?<ConstName>\w+?)\s+?(?<ConstValue>[^\s].+?)\s*$/gm},
        enumOutter: {Rgx: /enum\s+(?<EnumName>\w+?)[\s\n]+{(?<EnumInner>[\s\S]+?)}/gm},
        enumInner: {Rgx: /^\s*?(?<EnumKey>\w+?)(?:\s*?=\s*?(?<EnumValue>(-)?\d+?))?\s*?(?:,)?\s*?$/gm},
        comments: {Rgx: /\/\/.+/gm},
        fieldParams: {Rgx: /^((?:(?<Keyword>\w+?)\s+?)?(?<Type>\w+?)\s+?(?<Variable>\w+?))$/gm},
        fieldDefinition: {Rgx: /^\s+(?<FieldType>.+)\s+(?<FieldName>\w+)\((?<FieldParams>.*)\);(?:\s+\/\/.*)?$/gm},
        wrapperClass: {Rgx: /class BAKKESMOD_PLUGIN_IMPORT (?<WrapperClass>\w+)(\s+:\s+public\s+(?<WrapperSuperClass>\S+))?[\s]+{/gm}
    };

    let r = fs.readFileSync(file, "utf8");
    r = r.replace(tokenRegexes.comments.Rgx, ""); //Comments don't matter for our generation purposes

    console.log(file);

    //-- Enums
    let enumMatches = [...r.matchAll(tokenRegexes.enumOutter.Rgx)];
    if (enumMatches.length > 0) {
        _.each(enumMatches, em => {
            let enumValues = [...em.groups.EnumInner.matchAll(tokenRegexes.enumInner.Rgx)];
            let enumValuesMap = {};
            _.each(enumValues, enumValue => {
                enumValuesMap[enumValue.groups.EnumKey] = _.isUndefined(enumValue.groups.EnumValue) ? "" : enumValue.groups.EnumValue;
            });
            foundDefs.Enums[em.groups.EnumName] = enumValuesMap;
        });
    }

    //-- Constants
    let constantMatches = [...r.matchAll(tokenRegexes.defineConstants.Rgx)]
    if (constantMatches.length > 0) {
        _.each(constantMatches, cm => {
            foundDefs.Constants[cm.groups.ConstName] = cm.groups.ConstValue;
        });
    }

    //-- Classes
    let classMatches = [...r.matchAll(tokenRegexes.wrapperClass.Rgx)]
    if (classMatches.length > 0) {
        if (classMatches.length > 1) {
            throw new Error(`Found multiple classes defined in the same file: ${file}`);
        }

        let classDefinition = {
            SuperClass: classMatches[0].groups.WrapperSuperClass,
            Fields: {}
        }

        let classFieldDefinitions = [...r.matchAll(tokenRegexes.fieldDefinition.Rgx)]
        _.each(classFieldDefinitions, cfd => {
            let fieldDefinition = {
                Type: cfd.groups.FieldType,
                Parameters: []
            };
            if (cfd.groups.FieldParams.length > 0) {
                let paramterMatches = [...cfd.groups.FieldParams.matchAll(tokenRegexes.fieldParams.Rgx)]
                _.each(paramterMatches, pm => {
                    fieldDefinition.Parameters.push({
                        Keyword: pm.groups.Keyword,
                        Type: pm.groups.Type,
                        Name: pm.groups.Variable
                    });
                });
            }
            classDefinition.Fields[cfd.groups.FieldName] = fieldDefinition;
        });

        foundDefs.Classes[classMatches[0].groups.WrapperClass] = classDefinition;
    }
});
fs.writeFileSync("_bakkesmod_sdk_parsed_output.txt", JSON.stringify(foundDefs));