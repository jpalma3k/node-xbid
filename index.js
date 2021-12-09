process.on('uncaughtException', function (er) {
    console.log(er)
    process.exit(1)
})
const dotenv = require('dotenv')
const result = dotenv.config()
if (result.error) throw result.error

const main = async () => {
    try {
        console.log("hello world")
    }
    catch (error) {
        console.log(error)
    }
}

main()