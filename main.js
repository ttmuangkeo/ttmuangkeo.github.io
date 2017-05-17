    $(function() {

        var options = [{
            selector: '#scrollfire',
            offset: 300,
            callback: function(el) {
                Materialize.fadeInImage($(el));
            }
        }];
        Materialize.scrollFire(options);

        $('.parallax').parallax();
        console.log("test");


        $('.carousel.carousel-slider').carousel({ fullWidth: true });
    });
