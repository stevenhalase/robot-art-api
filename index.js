const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const User = require('./schema/user');
const Robot = require('./schema/robot');

// Connect MongoDB
mongoose.connect('mongodb+srv://robots_admin:xpbR43JVyQprDPCi@cluster0.l1jth.mongodb.net/robots?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
	console.log('DB Connected');
});

const app = express();
const port = 3000;

app.use(cors());

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

// Seed admin
const seedAdmin = async () => {
	const admin = await User.findOne({ email: 'admin@mondorobot.com' });
	if (!admin) {
		bcrypt.hash('R0bot4Lif3', 10, async function(err, hash) {
			const newAdmin = new User({
				fullName: 'Mondo Robot Admin',
				email: 'admin@mondorobot.com',
				password: hash,
				admin: true
			});
			await newAdmin.save();
		});
	}
}

seedAdmin();

const generateToken = (user, cb) => {
	crypto.randomBytes(48, async (err, buffer) => {
		const token = buffer.toString('base64');
		const tokenExpire = new Date(new Date().getTime() + 15*60*1000);
		user.authToken = token;
		user.authTokenExpire = tokenExpire.toISOString();
		const savedUser = await user.save();
		cb(savedUser);
	});
}

const authMiddleware = async (req, res, next) => {
	const whitelistRoutes = ['/login', '/register', '/logout'];
	if (whitelistRoutes.some(r => r === req.path)) {
		next();
	} else {
		try {
			const authentication = req.headers.authentication;
			if (authentication) {
				const authToken = authentication.replace('Bearer ', '');
				const user = await User.findOne({ authToken });
				if (user) {
					const expire = new Date(user.authTokenExpire);
					if (new Date() < expire) {
						req.user = user;
						next();
					} else {
						throw new Error();
					}
				} else {
					throw new Error();
				}
			} else {
				throw new Error();
			}
		} catch (error) {
			res.status(401).send('Failed to authenticate');
		}
	}
};

const adminMiddleware = async (req, res, next) => {
	const adminRoutes = ['/robot/:robotName'];
	try {
		if (adminRoutes.some(r => r === req.route.path)) {
			if (req.user && req.user.admin) {
				next();
			} else {
				throw new Error();
			}
		} else {
			next();
		}
	} catch (error) {
		res.status(401).send('Failed to authenticate');
	}
};

app.use(authMiddleware);

// Express Routing
app.post('/register', async (req, res) => {
	bcrypt.hash(req.body.password, 10, async function(err, hash) {
		console.log(hash);
		const newUser = new User({
			fullName: req.body.fullName,
			email: req.body.email,
			password: hash
		});
		const createdUser = await newUser.save();
		generateToken(createdUser, savedUser => {
			res.send(savedUser);
		});
	});
});

app.post('/login', async (req, res) => {
	const email = req.body.email;
	const password = req.body.password;
	const user = await User.findOne({ email });
	if (user) {
		bcrypt.compare(password, user.password, function(err, result) {
			if (result) {
				generateToken(user, savedUser => {
					res.send(savedUser);
				});
			} else {
				res.status(401).send('Failed to login');
			}
		});
	} else {
		res.status(401).send('Failed to login');
	}
});

app.get('/logout', async (req, res) => {
	const authentication = req.headers.authentication;
	if (authentication) {
		const authToken = authentication.replace('Bearer ', '');
		const user = await User.findOne({ authToken });
		if (user) {
			user.authToken = null;
			user.authTokenExpire = null;
			await user.save();
		}
	}
	res.send('Logged out');
});

app.get('/robot', async (req, res) => {
	const robots = await Robot.find({});
	res.send(robots);
});

app.post('/robot', adminMiddleware, upload.single('file'), async (req, res) => {
	const name = req.body.name;
	const image = {
		data: req.file.buffer.toString('base64'),
		contentType: req.file.mimetype
	};
	const newRobot = new Robot({ name, image});
	const createdRobot = await newRobot.save();
	res.send(createdRobot);
});

app.put('/robot/:robotId', async (req, res) => {
	// Remove previously cast votes for user
	const votedForRobots = await Robot.find({ votes: req.user._id });
	if (votedForRobots && votedForRobots.length) {
		for (const robot of votedForRobots) {
			robot.votes = robot.votes.filter(v => {
				return v !== req.user._id.toString();
			});
			await robot.save();
		}
	}
	
	// Apply new vote
	const robotId = req.params.robotId;
	const robot = await Robot.findOne({ _id: robotId });
	robot.votes.push(req.user._id);
	await robot.save();

	res.send(robot);
});

app.delete('/robot/:robotId', async (req, res) => {
	const robotId = req.params.robotId;
	await Robot.deleteOne({ _id: robotId });
	res.send('Deleted robot');
});

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`);
});