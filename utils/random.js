process.on('message', numInput => {
    const res = Array(1001).fill(0);
    for (let i = 0; i < numInput; i++) {
        const id = Math.floor(Math.random() * (1001 - 1) + 1);
        res[id] += 1;
    }
    process.send(res);
    process.exit();
});

process.send('init');
