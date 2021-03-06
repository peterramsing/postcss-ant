import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import chalk from 'chalk'

const ant = postcss.plugin('postcss-ant', (options = {}) => {
  return (css) => {
    // Assign global setting defaults.
    let namespace = options.namespace || ''
    let gutter = options.gutter || '30px'
    let grid = options.grid || 'nth'
    let support = options.support || 'flexbox'
    // Did the user specify global settings?
    css.walkAtRules(rule => {
      if (rule.name === 'ant-namespace') {
        namespace = rule.params
        rule.remove()
      }

      if (rule.name === 'ant-gutter') {
        gutter = rule.params
        rule.remove()
      }

      if (rule.name === 'ant-grid') {
        grid = rule.params
        rule.remove()
      }

      if (rule.name === 'ant-support') {
        support = rule.params
        rule.remove()
      }
    })

    // Line for console.log()
    const line = '--------------------------------------------------------------------------'

    css.walkDecls(decl => {
      // Tests if user is passing size(...) OR sizes(...) and pluck(...) -- indicating this is an ant declaration value.
      const antIndication = 'sizes?([^]*?)'
      const antIndicationRegex = namespace !== '' ? new RegExp(`${namespace}${antIndication}`, 'g') : new RegExp(antIndication, 'g')

      if (decl.value.match(antIndicationRegex) || decl.prop === `${namespace}generate-grid`) {
        // Sorry about all the walking -- too stupid to figure out another way. Entire damn thing needs refactored. 😜
        // 🎵 I am a sinner -- probably gonna sin again. 🎵

        // pow
        valueParser(decl.value).walk(node => {
          if (node.type === 'function' && node.value === 'pow') {
            const powArgs = node.nodes
              .filter(a => a.type === 'word')
              .map(a => Number(a.value))
            const powResult = Math.pow(powArgs[0], powArgs[1])
            decl.value = decl.value.replace(/pow\([^]+?\)/, powResult)
          }
        })

        // sum
        valueParser(decl.value).walk(node => {
          if (node.type === 'function' && node.value === 'sum') {
            const sumArgs = node.nodes
              .filter(a => a.type === 'word')
              .map(a => Number(a.value))
            const sumResult = sumArgs.reduce((prev, curr) => prev + curr)
            decl.value = decl.value.replace(/sum\([^]+?\)/, sumResult)
          }
        })

        // ratio()
        // Collect ratios into array.
        let ratios = []
        valueParser(decl.value).walk(node => {
          if (node.type === 'function' && node.value === 'ratio') {
            ratios.push(node)
          }
        })

        // Loop over ratios, performing pow to create numerators. Stashing those numerators in an array.
        let numerators = []
        ratios.forEach(ratio => {
          const ratioArgs = ratio.nodes
            .filter(a => a.type === 'word')
            .map(a => Number(a.value))
          const numerator = Math.pow(ratioArgs[0], ratioArgs[1])
          numerators.push(numerator)
        })

        // Get sum of numerators as denominator.
        let denominator
        if (numerators.length) {
          denominator = numerators.reduce((prev, curr) => prev + curr)
        }

        // Replace ratio() instances with the resulting fraction.
        ratios.forEach((ratio, i) => {
          decl.value = decl.value.replace(/ratio\([^]+?\)/, `${numerators[i]}/${denominator}`)
        })

        // Split up params and assign them to a params object (p).
        const paramsRegex = namespace !== '' ? new RegExp(`^${namespace}sizes?\([^]*\)`) : new RegExp(/^sizes?\([^]*\)/)

        // Improper namespacing error.
        if (!decl.value.match(paramsRegex)) {
          console.log(`
${line}

${chalk.red.underline('ant error')}: Couldn't process the parameter provided in:

${decl.parent.selector} {
  ${decl};
}

It's possible you set a namespace, and aren't using it ${chalk.bold('everywhere')}.
If you are using a namespace, make sure ${chalk.bold('generate-grid')} and ${chalk.bold('all')} ant methods are prefixed with it.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

          `)
          return
        }

        const paramsArr = postcss.list.space(decl.value.match(paramsRegex)[0])
        let p = {}
        paramsArr.forEach(param => {
          // Reject any non-ant params.
          const validParams = 'sizes?\\(|pluck\\(|grid\\(|gutter\\(|bump\\(|support\\('
          const validParamsRegex = namespace !== '' ? new RegExp(`^${namespace}${validParams}`) : new RegExp(`^${validParams}`)

          if (!param.match(validParamsRegex)) {
            console.log(`
${line}

${chalk.red.underline('ant error')}: ${chalk.red(param)} isn't a valid parameter in:

${decl.parent.selector} {
  ${decl};
}

Try one of these parameters instead: ${chalk.green('sizes, pluck, grid, gutter, bump, support')}

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }

          // Strip quotes.
          let quoteless = param.replace(/'|"/g, '')

          // Get key: value matches that coorespond to each param(arg).
          const keyVal = quoteless.match(/(.*)\(([^]*)\)/)

          // Strip namespace from key.
          const namespacelessKey = keyVal[1].replace(namespace, '')

          // Assign them to the p object.
          Object.assign(p, JSON.parse(`{ "${namespacelessKey}": "${keyVal[2]}" }`))
        })

        // Use global settings if no local settings exist.
        p.gutter = p.gutter || gutter
        p.grid = p.grid || grid
        p.support = p.support || support

        // If singular size(...), set pluck() to 1 and sizes() to p.size.
        if (decl.value.match(/size\([^]*\)/)) {
          // Throw an error if user is trying to pass pluck() along with singular size().
          if (decl.value.match(/pluck\([^]*\)/)) {
            console.log(`
${line}

${chalk.red.underline('ant error')}: You can't pass pluck(${chalk.red(p.pluck)}) along with ${chalk.bold('singular')} size(${chalk.red(p.size)}) in:

${decl.parent.selector} {
  ${decl};
}

Try removing pluck(${chalk.red(p.pluck)}) or changing size(${chalk.red(p.size)}) to sizes(${chalk.green(p.size)}).

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }

          // Throw error if user passes too many args to size().
          if (postcss.list.space(p.size).length > 1) {
            console.log(`
${line}

${chalk.red.underline('ant error')}: You tried passing too many sizes to the singular ${chalk.red('size()')} function in:

${decl.parent.selector} {
  ${decl};
}

Try just passing a single size like size(${chalk.green(postcss.list.space(p.size)[0])})
Or use the ${chalk.green('sizes()')} function along with ${chalk.green('pluck()')} instead.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }

          p.sizes = p.size
          p.pluck = 1
        }

        // Split sizes.
        p.sizes = postcss.list.space(p.sizes)

        // Convert pluck(...) to number for use in arrays later. Everything else should be strings.
        p.pluck = Number(p.pluck)

        // Ensure bump is something usable.
        if (p.bump) {
          if (p.bump.match(/\-|\+|\*|\//g)) {
            p.bump = p.bump.replace(/\-|\+|\*|\//g, match => {
              return ` ${match} `
            })
          } else {
            p.bump = ` + ${p.bump}`
          }
          p.bump = ` ${p.bump}`
        }

        // If pluck(...) doesn't work with sizes(...) then throw a helpful error. These 2 args are required.
        if (!p.sizes[p.pluck - 1] && decl.prop !== `${namespace}generate-grid`) {
          console.log(`
${line}

${chalk.red.underline('ant error')}: pluck(${chalk.red(p.pluck)}) isn't a valid index in:

${decl.parent.selector} {
  ${decl};
}

Remember the indexes are 1-based, not 0-based like you're probably used to.
Try pluck(${chalk.green(p.pluck + 1)}) instead.

Also, make sure you're passing ${chalk.bold('something')} to your size parameter.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

          `)
        }

        // If grid(...) is not a valid grid type, throw a helpful error.
        const gridsRegex = /^nth$|^negative-margin$/
        if (!p.grid.match(gridsRegex)) {
          console.log(`
${line}

${chalk.red.underline('ant error')}: grid(${chalk.red(p.grid)}) isn't a valid grid type in:

${decl.parent.selector} {
  ${decl};
}

Try grid(${chalk.green('nth')}) or grid(${chalk.green('negative-margin')}) instead.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

          `)
        }

        // Valid CSS lengths (identifies fixed numbers).
        const unitsRegex = /em$|ex$|%$|px$|cm$|mm$|in$|pt$|pc$|ch$|rem$|vh$|vw$|vmin$|vmax$/

        // Sort sizes into fixed and fraction arrays, and count number of autos.
        let fixedArr = []
        let fracArr = []
        let numAuto = 0
        p.sizes.forEach(size => {
          if (size.match(unitsRegex)) {
            fixedArr.push(size)
          } else if (size.match(/\/|\./)) {
            fracArr.push(size)
          } else if (size.match(/auto/)) {
            numAuto += 1
          } else {
            console.log(`
${line}

${chalk.red.underline('ant error')}: You didn't pass any appropriate sizes in:

${decl.parent.selector} {
  ${decl};
}

Try something like sizes(${chalk.green('100px 1/2 1/2')}) or size(${chalk.green('1/3')}) instead.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }
        })

        // Get the sum of all the fixed numbers.
        const numFixed = fixedArr.length
        let sumFixed = ''
        if (numFixed === 1) {
          sumFixed = `${fixedArr.join(' + ')}`
        } else if (numFixed > 1) {
          sumFixed = `(${fixedArr.join(' + ')})`
        } else {
          sumFixed = 0
        }

        // Get the sum of all the fractions.
        const numFrac = fracArr.length
        let sumFrac = ''
        if (numFrac > 0) {
          sumFrac = `(${fracArr.join(' + ')})`
        } else {
          sumFrac = 0
        }

        // Conditional Math Hell -- Abandon all hope, ye who enter here...
        const getSize = () => {
          // Alias for use in billion calc formulas.
          const val = p.sizes[p.pluck - 1]
          let gut
          if (Number(p.gutter) === 0) {
            gut = 0
          } else {
            gut = p.gutter
          }
          const bump = p.bump || ''

          // val is a fixed number
          if (val.match(unitsRegex)) {
            if (bump) {
              return `calc(${val}${bump})`
            } else {
              return val
            }
          }

          // val is a fraction
          if (val.match(/\/|\./)) {
            // fraction(s) only
            if (numFrac > 0 && numFixed === 0 && numAuto === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc(99.99% * ${val} - (${gut} - ${gut} * ${val})${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc(99.99% * ${val} - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 2

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc(99.999999% * ${val}${bump})`
              }
            }

            // fraction(s) and fixed number(s) only
            if (numFrac > 0 && numFixed > 0 && numAuto === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${val} - (${gut} - ${gut} * ${val})${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${val} - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 3

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc((99.999999% - ${sumFixed}) * ${val}${bump})`
              }
            }

            // fraction(s) and auto(s) only
            if (numFrac > 0 && numAuto > 0 && numFixed === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc(99.99% * ${val} - (${gut} - ${gut} * ${val})${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc(99.99% * ${val} - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 4

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc(99.999999% * ${val}${bump})`
              }
            }

            // fraction(s), fixed number(s), and auto(s)
            if (numFrac > 0 && numFixed > 0 && numAuto > 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${val} - (${gut} - ${gut} * ${val})${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${val} - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 5

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc((99.999999% - ${sumFixed}) * ${val}${bump})`
              }
            }
          }

          // val is auto
          if (val.match(/auto/)) {
            // auto(s) only
            if (numAuto > 0 && numFrac === 0 && numFixed === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc((99.99% - ((${numAuto} - 1) * ${gut})) / ${numAuto}${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc((99.99% - ((${numAuto}) * ${gut})) / ${numAuto}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 6

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc(99.999999% / ${numAuto}${bump})`
              }
            }

            // auto(s) and fixed number(s) only
            if (numAuto > 0 && numFixed > 0 && numFrac === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc((99.99% - ${sumFixed} - ((${numFixed} + ${numAuto} - 1) * ${gut})) / ${numAuto}${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc((99.99% - ${sumFixed} - ((${numFixed} + ${numAuto}) * ${gut})) / ${numAuto}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 7

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc((99.999999% - ${sumFixed}) / ${numAuto}${bump})`
              }
            }

            // auto(s) and fraction(s) only
            if (numAuto > 0 && numFrac > 0 && numFixed === 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc(((99.99% - (99.99% * ${sumFrac} - (${gut} - ${gut} * ${sumFrac}))) / ${numAuto}) - ${gut}${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc(((99.99% - (99.99% * ${sumFrac})) / ${numAuto}) - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 8

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc((99.999999% - (99.999999% * ${sumFrac})) / ${numAuto}${bump})`
              }
            }

            // auto(s), fraction(s), and fixed number(s)
            if (numAuto > 0 && numFrac > 0 && numFixed > 0) {
              if (gut) {
                switch (p.grid) {
                  // nth grids
                  case 'nth':
                    return `calc((99.99% - ((${sumFixed} + (${gut} * ${numFixed})) + ((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${sumFrac} - (${gut} - ${gut} * ${sumFrac}))) - (${gut} * ${numAuto})) / ${numAuto}${bump})`

                  // negative-margin grids
                  case 'negative-margin':
                    return `calc((99.99% - ((${sumFixed} + (${gut} * ${numFixed})) + ((99.99% - (${sumFixed} + (${gut} * ${numFixed}))) * ${sumFrac} - (${gut} * ${numFrac}))) - (${gut} * ${numAuto})) / ${numAuto} - ${gut}${bump})`

                  default:
                    console.log(`
  ${line}

  ${chalk.red.underline('ant error')} 9

  Please file a bug at https://github.com/corysimmons/postcss-ant/issues/new

  ${line}

                    `)
                }
                return
              } else {
                // gutless
                return `calc((99.999999% - (${sumFixed} + ((99.999999% - ${sumFixed}) * ${sumFrac}))) / ${numAuto}${bump})`
              }
            }
          }
        }

        // Is this an ant decl.prop? If so, loop over it and output appropriate styles.
        if (decl.prop === `${namespace}generate-grid`) {
          // Throw error if pluck().
          if (decl.value.match(/pluck\([^]*?\)/)) {
            console.log(`
${line}

${chalk.red.underline('ant error')}: Don't use ${chalk.red('pluck()')} in:

${decl.parent.selector} {
  ${decl};
}

${namespace}generate-grid: ... automatically iterates over sizes to create loops with (or without) preprocessors.

pluck() is used to fetch a particular size, so it's not needed in this context.

If you'd like to fetch a particular size, try using something like:

${decl.parent.selector} {
  width: sizes(${p.sizes}) pluck(${p.pluck});
}

If you'd like to combine both techniques for offsetting and such, try overwriting the loop afterwards like:

${decl.parent.selector} {
  ${namespace}generate-grid: sizes(${p.sizes}) grid(negative-margin);
}

${decl.parent.selector} > *:nth-child(${p.pluck}) {
  margin-right: sizes(${p.sizes}) pluck(${(p.pluck + 1)}) bump(${p.gutter} * 1.5);
}

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }

          // Applies to current selector.
          if (p.support === 'flexbox') {
            decl.cloneBefore({
              prop: 'display',
              value: 'flex'
            })
            decl.cloneBefore({
              prop: 'flex-wrap',
              value: 'wrap'
            })
          } else if (p.support === 'float') {
            // Clearfix with :after selector for IE8.
            postcss.rule({
              selector: `${decl.parent.selector}:after,\n${decl.parent.selector}::after `
            }).moveAfter(decl.parent)

            decl.clone({
              prop: 'content',
              value: '\'\''
            }).moveTo(decl.parent.next())

            decl.clone({
              prop: 'display',
              value: 'table'
            }).moveTo(decl.parent.next())

            decl.clone({
              prop: 'clear',
              value: 'both'
            }).moveTo(decl.parent.next())
          } else {
            console.log(`
${line}

${chalk.red.underline('ant error')}: support(${chalk.red(p.support)}) isn't a valid support() option in:

${decl.parent.selector} {
  ${decl};
}

Try support(${chalk.green('flexbox')}) (default) or support(${chalk.green('float')}) instead.

If you're pretty sure you're doing everything right, please file a bug at:
https://github.com/corysimmons/postcss-ant/issues/new

${line}

            `)
          }

          // Set negative margins if needed.
          if (p.grid === 'negative-margin') {
            decl.cloneBefore({
              prop: 'margin-left',
              value: `calc(-${p.gutter} / 2)`
            })

            decl.cloneBefore({
              prop: 'margin-right',
              value: `calc(-${p.gutter} / 2)`
            })
          }

          // Create rules. Override p.pluck to start at 1 and create a rule for each size in sizes().
          for (p.pluck = p.sizes.length; p.pluck >= 1; p.pluck--) {
            const antLoop = () => {
              // Creates .selector:nth-child(3n + 1) ... (3n + 2) ... (3n + 3) ... rules after the current selector.
              postcss.rule({
                selector: `${decl.parent.selector} > *:nth-child(${p.sizes.length}n + ${p.pluck}) `
              }).moveAfter(decl.parent)

              // Processes ant to get correct sizes.
              decl.clone({
                prop: 'width',
                value: getSize()
              }).moveTo(decl.parent.next())

              // Clear new rows on float layouts.
              if (p.pluck === 1) {
                if (p.support === 'float') {
                  if (p.grid === 'nth') {
                    decl.clone({
                      prop: 'clear',
                      value: 'left'
                    }).moveTo(decl.parent.next())
                  }
                }
              }
            }

            // Remove margin-right from last element in row in nth grids.
            if (p.grid === 'nth') {
              if (p.pluck === p.sizes.length) {
                postcss.rule({
                  selector: `${decl.parent.selector} > *:nth-child(${p.sizes.length}n + ${p.sizes.length}) `
                }).moveAfter(decl.parent)

                decl.clone({
                  prop: 'width',
                  value: getSize()
                }).moveTo(decl.parent.next())

                decl.clone({
                  prop: 'margin-right',
                  value: '0'
                }).moveTo(decl.parent.next())
              } else {
                antLoop()
              }
            } else if (p.grid === 'negative-margin') {
              antLoop()
            }
          }

          // Set margin-right on all child elements.
          postcss.rule({
            selector: `${decl.parent.selector} > * `
          }).moveAfter(decl.parent)

          if (p.support === 'float') {
            decl.clone({
              prop: 'float',
              value: 'left'
            }).moveTo(decl.parent.next())
          }

          if (p.grid === 'nth') {
            decl.clone({
              prop: 'margin-right',
              value: p.gutter
            }).moveTo(decl.parent.next())
          } else if (p.grid === 'negative-margin') {
            decl.clone({
              prop: 'margin-left',
              value: `calc(${p.gutter} / 2)`
            }).moveTo(decl.parent.next())

            decl.clone({
              prop: 'margin-right',
              value: `calc(${p.gutter} / 2)`
            }).moveTo(decl.parent.next())
          }

          // Remove selector if no other nodes present.
          if (decl.parent.nodes.every(node => node === decl)) {
            decl.parent.remove()
          }

          // Remove ant: ... declaration.
          decl.remove()
        } else {
          decl.value = getSize()
        }
      }
    })
  }
})

export default ant
