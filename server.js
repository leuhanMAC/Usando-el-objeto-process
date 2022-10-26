import { createServer } from 'http';
import { engine } from "express-handlebars";
import { Server as IOServer } from 'socket.io';
import dotenv from 'dotenv';
import express, { Router, json, urlencoded } from "express";
import mongoStore from 'connect-mongo';
import passport from "passport";
import session from 'express-session';
import yargs from 'yargs';
import { fork } from 'child_process';

import './middlewares/passport/index.js';
import { chatSchema } from "./modules/chat.js";
import { productSchema } from "./modules/products.js";
import Container from "./container/index.js";

const productFiles = new Container("product", productSchema);
const chat = new Container("chat", chatSchema);
const args = yargs(process.argv.slice(2)).default({ port: 3000 }).argv

const PORT = args.port;

dotenv.config();
const app = express();
const productRouter = Router();
const userRouter = Router();
const randomRouter = Router();
const httpServer = new createServer(app);
const io = new IOServer(httpServer);

//Handlebars
app.set("views", "./views");
app.set("view engine", "hbs");

app.engine(
    "hbs",
    engine({
        extname: ".hbs",
    })
);

//Session
app.use(
    session({
        store: mongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            options: {
                userNewParser: true,
                useUnifiedTopology: true
            }
        }),
        secret: process.env.SECRET,
        resave: true,
        saveUninitialized: true,
        cookie: { maxAge: 600000 }
    })
);

// JSON
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(express.static("public"));

//Passport
app.use(passport.initialize());
app.use(passport.session());

// Router
app.use("/productos", productRouter);
app.use("/api/usuario", userRouter);
app.use("/api/randoms", randomRouter);

//App
app.get("/", async (req, res) => {
    const products = await productFiles.getAll();
    const messages = await chat.getAll();
    const username = req.session.username || '';

    res.render("homepage", {
        username,
        products,
        messages,
        emptyProducts: !Boolean(products.length),
    });
});

app.get("/chat", async (req, res) => {
    const messages = await chat.getAll();
    const username = req.session.username || '';

    res.render("chat", {
        messages,
        username
    });
});

app.get("/info", async (req, res) => {

    const info = {
        inputArgs: JSON.stringify(args, null, 3),
        plataformName: process.platform,
        nodeVersion: process.version,
        rss: process.memoryUsage().rss + ' Bytes',
        executionPath: process.title,
        processID: process.pid,
        projectFolder: process.cwd()
    }
    const username = req.session.username || '';

    res.render("info", { info, username });
});

app.get("/api/productos", async (req, res) => {
    const products = await productFiles.getAll();
    res.json(products);
    res.end();
});

app.get("/register", async (req, res) => {
    res.render("register");
});
app.get("/login", async (req, res) => {
    res.render("login");
});

app.get("/faillogin", async (req, res) => {
    res.render("errorLogin");
});

app.get("/failregister", async (req, res) => {
    res.render("errorRegister");
})

app.get("/logout", async (req, res) => {

    req.session.destroy(
        (err) => {
            if (err) {
                res.json(err);
            } else {
                res.redirect('/');
            }
        }
    )
});

// Product router
productRouter.get("/", async (req, res) => {
    const products = await productFiles.getAll();

    res.render("productList", {
        products,
        emptyProducts: !Boolean(products.length)
    })
});

productRouter.post(
    "/",
    async (req, res) => {
        const { title, price, thumbnail } = req.body;

        await productFiles.save({
            title,
            price,
            thumbnail,
        });
        res.redirect("/");
    }
);

// User router
userRouter.post(
    '/login',
    passport.authenticate('login', { failureRedirect: '/faillogin' }),
    async (req, res) => {
        const { username } = req.body;

        req.session.username = username;
        req.session.login = 'logged';

        res.redirect('/');
    }
);

userRouter.post(
    '/register',
    passport.authenticate('signup', { failureRedirect: '/failregister' }),
    async (req, res) => {
        const { username, firstName, lastName } = req.body;

        req.session.username = username;
        req.session.firstName = firstName;
        req.session.lastName = lastName;

        res.redirect('/');
    }
)

//Random Router
randomRouter.get('/', async (req, res) => {

    const forkedRandom = fork('./utils/random.js');
    const username = req.session.username || '';

    forkedRandom.on('message', msg => {

        const cant = Number(req.query.cant) || 100000000;

        if (msg === 'init') {
            forkedRandom.send(cant);
        } else {
            const randomNumbers = { ...msg };
            delete randomNumbers[0];

            res.render("random",
                { randomNumbers, username }
            );

        }

    });

});

//SocketIO
io.on("connection", async (socket) => {

    socket.on("add-product-server", async (data) => {
        await productFiles.save(data);
        io.emit("add-product-client", data);
        console.log('Product added!')
    });

    socket.on("add-message-server", async (data) => {
        await chat.save(data);
        io.emit("add-message-client", data);
        console.log('Message added!');
    })
});

httpServer.listen(PORT, () => {
    console.log('SERVER ON', PORT);
});
