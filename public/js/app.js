// TODO
// create help screen with bot instructions

var emailCookie = 'publicspacesEmail';
var installedCookie = 'publicspacesInstalled';
var sidCookie = 'sid';
var email = readCookie(emailCookie);
var installed = readCookie(installedCookie);
var shortId;
var spaceTitle;
var spaceId;
var spaceList;

String.prototype.truncString = function(max, add){
   add = add || '…';
   return (this.length > max ? this.substring(0,max)+add : this);
};

function getSpaces(callback) {
	$.ajax({
		method: 'GET',
		url: './api/spaces',
		dataType: 'JSON'
	})
	.done(function(response) {
		if (response.responseCode === 0) {
			callback(response.spaces);
			createCookie(installedCookie,true,100000);
		}
		else if (response.responseCode === 1) {
			callback();
			createCookie(installedCookie,true,100000);
		}
		else if (response.responseCode === -1) {
			$('#title').html('Discover More Spaces');
			$('#message').html("You must verify your email via a Spark message.");
			paintEmailInput();
		}
	})
	.fail(function() {
		callback();
	})
	.always(function() {
		//
	});
}

function sortBy(property) {
	var sortOrder = 1;
	if(property[0] === "-") {
		sortOrder = -1;
		property = property.substr(1);
	}
	return function (a,b) {
		var result = (a[property].toLowerCase() < b[property].toLowerCase()) ? -1 : (a[property].toLowerCase() > b[property].toLowerCase()) ? 1 : 0;
		return result * sortOrder;
	}
}

function paintSpacesList(spaces = {}) {

	$("#message").html('');
	$('#title').html('');

	if (Object.keys(spaces).length === 0)
		return;

	spaces.sort(sortBy("title"));

	$('#list').html($('#spaceListTemplate').html());

	spaces.forEach(function(space){
		var spaceHtml = $("#spaceTemplate").html()
			.replace("%URL%", "./#"+space.shortId)
			.replace("%TEXT%", space.title.truncString(60))
			.replace("%HITS%", space.hits)
		if (space.member) {
			spaceHtml = spaceHtml
				.replace("%DISABLED%", "disabled");
			$("#spaceListJoined").append(spaceHtml);
			$('#joinedLabel').show();
		}
		else {
			spaceHtml = spaceHtml
				.replace("%DISABLED%", "");
			$("#spaceListJoin").append(spaceHtml);
		}
	});

	$('#list').show();

	paintSearchInput();

}

function checkShortId() {
	var hash = window.location.hash;
	shortId = decodeURIComponent(hash.substring(1, hash.length));
	var icon, message;
	$('#title').html('');
	if (shortId == '') {
		$('#title').html("<i class='fa fa-refresh fa-spin'></i>");
		getSpaces(paintSpacesList);
	} else {
		$('#title').html("<i class='fa fa-refresh fa-spin'></i>");
		$.ajax({
			method: 'GET',
			url: './api/shortid/'+shortId,
			dataType: 'JSON'
		})
		.done(function(data) {
			if (data.responseCode == 1) {
				message = "Invalid URL";
				$('#title').html(message);//'<span><i class="fa '+icon+'"></i> '+message+'</span>');
				return;
			} else if (data.responseCode == 2) {
				$('#input').html('');
				$('#message').html('');
				message = "URL is no longer active";
				$('#title').html(message);//'<span><i class="fa '+icon+'"></i> '+message+'</span>');
				return;
			} else if (data.responseCode == 11) {
				$('#input').html('');
				$('#message').html('');
				message = "We've hit an error. Please retry.";
				$('#title').html(message);//'<span><i class="fa '+icon+'"></i> '+message+'</span>');
				return;
			} else {
				spaceTitle = data.title;
				spaceId = data.spaceId;
				$('#title').html(spaceTitle);
			}
			if (email !== null && (installed !== null && installed == 'true')) {
				joinSpace(shortId);
			} else if (email !== null && (installed == null || installed == 'false')) {
				$('#input').html($('#installedInputTemplate').html());
			} else {
				paintEmailInput();
			}
		})
		.fail(function() {
			message = "Oops. Something went wrong.";
			//icon = "fa-exclamation-circle";
			$('#title').html(message);//'<span><i class="fa '+icon+'"></i> '+message+'</span>');
			return;
		})
		.always(function() {
			//alert( "complete" );
		});
	}
}

function checkInstalled(state) {
	createCookie(installedCookie,state,100000);
	$('#input').html('');
	$('#message').html('');
	installed = state.toString();
	if (shortId != '')
		joinSpace(shortId);
	else {
		if (state == true)
			$('#message').html("Follow the link in the Cisco Spark message you just got to verify your email.");
		else {
			$('#message').html("Follow the link in the Cisco Spark message you just got to verify your email.");
			if (navigator.userAgent.match(/(ip(od|hone|ad))/i))
				sparkUrl = "itms-apps://itunes.apple.com/us/app/project-squared/id833967564?ls=1&mt=8";
			else if (navigator.userAgent.match(/android/i))
				sparkUrl = "https://play.google.com/store/apps/details?id=com.cisco.wx2.android";
			else
				sparkUrl = "https://www.ciscospark.com/downloads.html";
      	var html = "<button class='btn btn-lg btn-block btn-success' onClick=\"window.location = '"+sparkUrl+"'\">Get Cisco Spark</button>"
			$('#input').html(html);
		}
	}
}

function checkEmail() {
	email = $('#emailInput').val().trim();
	if (email == '') {
		return;
	}
	var url = './api/email/'+email;
	if (shortId == '')
		url = './api/auth/'+email
	$('#message').html("<i class='fa fa-refresh fa-spin'></i>");
	$.ajax({
		url : url,
		type: "GET",
		dataType: 'JSON'
	})
	.done(function(data){
		$('#message').html('');
		switch (data.responseCode) {
			case 0:
				createCookie(emailCookie,email,100000);
				setEmail();
				if (installed == 'true') {
					$('#input').html('');
					if (shortId != '')
						joinSpace(shortId);
					else
						$('#message').html("Follow the link in the Cisco Spark message you just got to verify your email.");
				} else {
					$('#input').html($('#installedInputTemplate').html());
				}
				break;
			case 12:
				$('#message').html("Email is not Cisco Spark enabled. Contact your IT administrator.");
				paintEmailInput();
				break;
			default:
				$('#message').html("Invalid email");
				paintEmailInput();
				break;
		}
	})
	.fail(function(){
		var message = "We're having some problems. Check back soon.";
		$('#message').html(message);//'<span><i class="fa fa-question-circle-o"></i> '+message+'</span>');
		$('#input').html('');
	})
	.always(function(){
		//
	});
}

function searchSpaces(searchText) {
	$('.space').each(function(){
		var show = $(this).find('.space-title').text().toLowerCase().indexOf(searchText.toLowerCase()) !== -1;
		$(this).toggle(show);
		if ($('#spaceListJoined .space:visible').length === 0)
			$('#joinedLabel').hide();
		else
			$('#joinedLabel').show();
	}); 
}

function paintSearchInput() {
	$('#input').html($('#searchInputTemplate').html());
	$('#searchInput').on('keyup', function(){
		searchSpaces($(this).val());
	});
	$('#searchInput').focus();
	if (
		typeof(_get['search']) !== 'undefined'
		&& _get['search'] != ''
		) {
		$('#searchInput').val(_get['search']);
	}
}

function paintEmailInput() {
	$('#input').html($('#emailInputTemplate').html());
	$('#emailInput').keypress(function(e) { if(e.which == 13) { checkEmail(); } });
	$('#emailInput').focus();
	if (
		typeof(_get['email']) !== 'undefined'
		&& _get['email'] != ''
		) {
		$('#emailInput').val(_get['email']);
	} else if (email !== null)
		$('#emailInput').val(email);
}

function handleBotResults(data) {
/*
0=added to space
1=missing email post var
2=missing session post var
3=invlaid email
4=invlaid session
5=already in space
6=failed to add to space
7=new spark user and added to space
8=client side ajax error
9=asked to join a space
10=no longer active
11=error, try again
12=email not spark enabled
*/
	var sparkUrl = null;
	if (navigator.userAgent.match(/(ip(od|hone|ad))/i)) {
		if (installed == 'true') {
			sparkUrl = "spark://rooms/"+Base64.decode(spaceId).replace(/^.*\/([^\/]+)$/, "$1");
		} else {
			sparkUrl = "itms-apps://itunes.apple.com/us/app/project-squared/id833967564?ls=1&mt=8";
		}
	} else if (navigator.userAgent.match(/android/i)) {
		if (installed == 'true') {
			sparkUrl = "spark://rooms/"+Base64.decode(spaceId).replace(/^.*\/([^\/]+)$/, "$1");
		} else {
		//if (installed == 'false') {
			sparkUrl = "https://play.google.com/store/apps/details?id=com.cisco.wx2.android";
		}
	} else {
		if (installed == 'false') {
			sparkUrl = "https://www.ciscospark.com/downloads.html";
		} /* else {
			sparkUrl = "https://web.ciscospark.com";
		} */
	}
	if (sparkUrl !== null) {
		var successText;
		if (installed == 'true') successText = 'Open Cisco Spark';
		else successText = 'Get Cisco Spark';
		var successHtml = "<button class='btn btn-lg btn-block btn-success' onClick=\"window.location = '"+sparkUrl+"'\">"+successText+"</button>";
		successHtml += "<button class='btn btn-lg btn-block btn-default' onClick=\"window.location = './'\">Discover More Spaces</button>";
	} else {
		var successHtml = "<button class='btn btn-lg btn-block btn-default' onClick=\"window.location = './'\">Discover More Spaces</button>";
	}

	switch (data.responseCode) {
		case 0:
			setEmail();
			$('#message').html('Added to Cisco Spark space');
			$('#input').html(successHtml);
			break;
		case 1:
			eraseCookie(emailCookie);
			$('#message').html("Invalid email");
			paintEmailInput();
			break;
		case 2:
			setEmail();
			$('#title').html("Invalid URL");
			$('#message').html('');
			$('#input').html('');
			break;
		case 3:
			eraseCookie(emailCookie);
			$('#message').html("Invalid email");
			paintEmailInput();
			break;
		case 4:
			setEmail();
			$('#title').html("Invalid URL");
			$('#message').html('');
			$('#input').html('');
			break;
		case 5:
			setEmail();
			$('#message').html("Already in Cisco Spark space");//+'<br/><span>'+spaceTitle+'</span><br/><span>'+message+'</span>');
			$('#input').html(successHtml);
			break;
		case 6:
			setEmail();
			var message = "Couldn't add to Cisco Spark space<br/>Admins have been notified";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 7:
			setEmail();
			var message = "Added to Cisco Spark space<br/>Check your email for instructions";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 8:
			setEmail();
			var message = "Couldn't add to Cisco Spark space";
			if (supportEmail != '')
				message += "<br/>Contact <a href='mailto:"+supportEmail+"'>"+supportEmail+"</a>";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 9:
			setEmail();
			var message = "Request sent to space moderator to add you";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 10:
			setEmail();
			var message = "URL is no longer active";
			$('#message').html(message);
			$('#input').html('');
			break;
		default:
			setEmail();
			var message = "Failed to add to Cisco Spark space<br/>Admins have been notified";
			$('#message').html(message);
			$('#input').html('');
			break;
	}
}

function joinSpace(shortId) {
	//var message = "Adding to Cisco Spark space";
	$('#message').html("<i class='fa fa-refresh fa-spin'></i>");
	$.ajax({
		url : './api/shortid/'+shortId,
		type: "POST",
		contentType: "application/json; charset=utf-8",
		data : JSON.stringify({
			email: email 
		}),
		dataType: 'JSON'
	})
	.done(function(data){
		handleBotResults(data);
	})
	.fail(function(){
		var data = { responseCode:'', responseMessage:'' };
		handleBotResults(data);
	})
	.always(function(){
		//
	});
}

function setEmail() {
	if (email !== null) {
		$('#email').html(email);
		$('#emailContainer').show();
	}
}

function cleanSidCookie() {
	eraseCookie(sidCookie);
	$.ajax({
		method: 'GET',
		url: './api/auth/clean',
	})
	.done(function(response) {
		//
	})
	.fail(function() {
		//
	})
	.always(function() {
		//
	});
}

function sortBy(property) {
	var sortOrder = 1;
}

function setup() {
	$('#logo').attr('src', botAvatar);
	$('#logo').attr('title', botName+' ('+botEmail+')');
	document.title = botName+' | Join Spark Spaces';
	$('<style>.site-wrapper:before{background-image:url('+botAvatar+')}</style>').appendTo('head');
	if (supportEmail != '') {
		$('#support').show();
		var supportSubject = 'Question about joining Cisco Spark Space via '+botName+' ('+botEmail+')';
		$('#support').on('click', function() {
			window.location.href='mailto:'+supportEmail+'?subject='+supportSubject+' '+shortId+'&body='+window.location.href;
		});
	}
	$('#emailContainer').on('click', function() {
		$('#message').html('');
		$('#input').html('');
		$('#list').html('');
		email = null;
		installed = null;
		eraseCookie(emailCookie);
		cleanSidCookie();
		eraseCookie(installedCookie);
		$("#emailContainer").hide();
		checkShortId();
	});
	$(window).bind( 'hashchange', function() {
		$("#message").show();
		$('#message').html('');
		$('#input').html('');
		$('#title').html('');
		$('#list').html('');
		checkShortId();
	});
}

$(document).ready(function() {
	setup();
	setEmail();
	checkShortId();
});
