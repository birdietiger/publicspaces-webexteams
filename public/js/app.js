// TODO
// create help screen with bot instructions

var emailCookie = 'publicspacesEmail';
var installedCookie = 'publicspacesInstalled';
var sidCookie = 'sid';
var email = readCookie(emailCookie);
var internalOnly = false;
var domain;
var installed = readCookie(installedCookie);
var shortId;
var spaceTitle;
var spaceList;

String.prototype.truncString = function(max, add){
   add = add || '…';
   return (this.length > max ? this.substring(0,max)+add : this);
};

function getSpaces(callback) {
	$.ajax({
		method: 'GET',
		cache: false,
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
			$('#message').html("You must verify your identity via a Webex Teams message.");
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
		var result = (a[property].toString().toLowerCase() < b[property].toString().toLowerCase()) ? -1 : (a[property].toString().toLowerCase() > b[property].toString().toLowerCase()) ? 1 : 0;
		return result * sortOrder;
	}
}

function percentRank(array, n) {
    var L = 0;
    var S = 0;
    var N = array.length

    for (var i = 0; i < array.length; i++) {
        if (array[i] < n) {
            L += 1
        } else if (array[i] === n) {
            S += 1
        } else {

        }
    }

    var pct = (L + (0.5 * S)) / N

    return pct
}

function paintSpacesList(spaces) {

	if (typeof spaces === "undefined")
		spaces = {};

	$("#message").html('');
	$('#title').html('');
	$('#description').html('');
	setLogo(botAvatar, botName+' ('+botEmail+')', true);

	if (Object.keys(spaces).length === 0)
		return;

	spaces.sort(sortBy("-updated"));

	$('#list').html($('#spaceListTemplate').html());

	var hitsArray = [];
	spaces.forEach(function(space){
		hitsArray.push(space.hits);
	});

	spaces.forEach(function(space){

		var hits = '';
		if (percentRank(hitsArray, space.hits) >= .66)
			hits = '<span class="badge badge-default badge-pill fire"><i class="fa fa-fire"></i></span>';

		var spaceHtml = $("#spaceTemplate").html()
			.replace("%URL%", "./#"+space.shortId)
			.replace("%TEXT%", space.title.truncString(55))
			.replace("%INTERNAL%", space.internal)
			.replace("%HITS%", hits);

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
	var message;
	$('#title').html('');
	$('#description').html('');
	if (shortId == '') {
		$('#title').html("<i class='fa fa-sync fa-spin'></i>");
		$('#description').html(description);
		setLogo(botAvatar, botName+' ('+botEmail+')', true);
		getSpaces(paintSpacesList);
	} else {
		$('#title').html("<i class='fa fa-sync fa-spin'></i>");
		var logoUrl = botAvatar;
		var logoTitle = botName+' ('+botEmail+')';
		var logoRounded = true;
		$.ajax({
			method: 'GET',
			cache: false,
			url: './api/shortid/'+shortId,
			dataType: 'JSON'
		})
		.done(function(data) {
			if (data.responseCode == 1) {
				message = "Invalid URL";
				$('#title').html(message);
			} else if (data.responseCode == 2) {
				$('#input').html('');
				$('#message').html('');
				message = "URL is no longer active";
				$('#title').html(message);
			} else if (data.responseCode == 11) {
				$('#input').html('');
				$('#message').html('');
				message = "We've hit an error. Please retry.";
				$('#title').html(message);
			} else {
				spaceTitle = data.title;
				spaceDescription = data.description;
				$('#title').html(spaceTitle);
				if (spaceDescription)
					$('#description').html(spaceDescription.replace(/onclick=\"[^\"]*\"/, ''));
				if (data.logoUrl) {
					logoUrl = data.logoUrl;
					logoTitle = '';
					logoRounded = false;
				}
				if (email !== null && (installed !== null && installed == 'true')) {
					joinSpace(shortId);
				} else if (email !== null && (installed == null || installed == 'false')) {
					$('#input').html($('#installedInputTemplate').html());
				} else {
					paintEmailInput();
				}
			}
			setLogo(logoUrl, logoTitle, logoRounded);
		})
		.fail(function() {
			message = "Oops. Something went wrong.";
			$('#title').html(message);
		})
		.always(function() {
			//
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
			$('#message').html("Follow the link in the Webex Teams message you just got to verify your identity.");
		else {
			$('#message').html("Follow the link in the Webex Teams message you just got to verify your identity.");
			if (navigator.userAgent.match(/(ip(od|hone|ad))/i))
				teamsUrl = "itms-apps://itunes.apple.com/us/app/project-squared/id833967564?ls=1&mt=8";
			else if (navigator.userAgent.match(/android/i))
				teamsUrl = "https://play.google.com/store/apps/details?id=com.cisco.wx2.android";
			else
				teamsUrl = "https://www.webex.com/downloads.html";
      	var html = "<button class='btn btn-lg btn-block btn-success' onClick=\"window.location = '"+teamsUrl+"'\">Get Webex Teams</button>"
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
	$('#message').html("<i class='fa fa-sync fa-spin'></i>");
	$.ajax({
		url : url,
		type: "GET",
		cache: false,
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
						$('#message').html("Follow the link in the Webex Teams message you just got to verify your identity.");
				} else {
					$('#input').html($('#installedInputTemplate').html());
				}
				break;
			case 12:
				$('#message').html("Email is not Webex Teams enabled. Contact your IT administrator.");
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

function searchSpaces(searchText, internalOnlyState) {
	$('.space').each(function(){
		var show = $(this).find('.space-title').text().toLowerCase().indexOf(searchText.toLowerCase()) !== -1;
		if (internalOnlyState && $(this).hasClass('internal-false'))
			show = false;
		$(this).toggle(show);
		if ($('#spaceListJoined .space:visible').length === 0)
			$('#joinedLabel').hide();
		else
			$('#joinedLabel').show();
	});
}

function internalOnlyFilter(state) {
	$('.space.internal-false').each(function(){
		$(this).toggle();
	});
}

function paintSearchInput() {
	$('#input').html(
		$('#searchInputTemplate').html()
	);
	$('#internalFilter').on('click', function() {
		$(this)
			.toggleClass("btn-internal-on")
			.toggleClass("btn-internal-off");
		internalOnly = !internalOnly;
		searchSpaces($('#searchInput').val(), internalOnly);
	});
	$('#searchInput').on('keyup', function(){
		searchSpaces($(this).val(), internalOnly);
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
7=new teams user and added to space
8=client side ajax error
9=asked to join a space
10=no longer active
11=error, try again
12=email not teams enabled
13=can't add to internal only space
*/
	var teamsUrl = null;
	var spaceId = data.spaceId;
	if (spaceId !== undefined) {
		if (navigator.userAgent.match(/(ip(od|hone|ad))/i)) {
			if (installed != 'true') {
				teamsUrl = "itms-apps://itunes.apple.com/us/app/project-squared/id833967564?ls=1&mt=8";
			}
		} else if (navigator.userAgent.match(/android/i)) {
			if (installed != 'true') {
				teamsUrl = "https://play.google.com/store/apps/details?id=com.cisco.wx2.android";
			}
		} else {
			if (installed != 'true') {
				teamsUrl = "https://www.webex.com/downloads.html";
			} else {
        teamsUrl = "webexteams://im?space="+Base64.decode(spaceId).replace(/^.*\/([^\/]+)$/, "$1");
      }
		}
	}
	var discoverButtonHtml = "<button class='btn btn-lg btn-block btn-default btn-discover' onClick=\"window.location.hash = ''\">Discover More Spaces</button>";
	if (teamsUrl !== null) {
		var successText;
		if (installed == 'true') successText = 'Open Webex Teams';
		else successText = 'Get Webex Teams';
		var successHtml = "<button class='btn btn-lg btn-block btn-success' onClick=\"window.location = '"+teamsUrl+"'\">"+successText+"</button>";
		successHtml += discoverButtonHtml;
	} else {
		var successHtml = discoverButtonHtml;
	}

	switch (data.responseCode) {
		case 0:
			setEmail();
			$('#message').html('Added to Webex Teams space');
			$('#input').html(successHtml);
			break;
		case 1:
			eraseCookie(emailCookie);
			$('#emailContainer').hide();
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
			$('#emailContainer').hide();
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
			$('#message').html("Already in Webex Teams space");//+'<br/><span>'+spaceTitle+'</span><br/><span>'+message+'</span>');
			$('#input').html(successHtml);
			break;
		case 6:
			setEmail();
			var message = "Couldn't add to Webex Teams space<br/>Admins have been notified";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 7:
			setEmail();
			var message = "Added to Webex Teams space<br/>Check your email for instructions";
			$('#message').html(message);
			$('#input').html('');
			break;
		case 8:
			setEmail();
			var message = "Couldn't add to Webex Teams space";
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
		case 12:
			eraseCookie(emailCookie);
			$('#emailContainer').hide();
			var message = "Email is not Webex Teams enabled. Contact your IT administrator.";
			$('#message').html(message);
			$('#input').html('');
			paintEmailInput();
			break;
		case 13:
			$('#title').html('');
			$('#description').html('');
			setLogo(botAvatar, botName+' ('+botEmail+')', true);
			setEmail();
			var message = "Not permitted to Webex Teams space";
			$('#message').html(message);
			$('#input').html(discoverButtonHtml);
			break;
		default:
			setEmail();
			var message = "Failed to add to Webex Teams space<br/>Admins have been notified";
			$('#message').html(message);
			$('#input').html('');
			break;
	}
}

function joinSpace(shortId) {
	//var message = "Adding to Webex Teams space";
	$('#message').html("<i class='fa fa-sync fa-spin'></i>");
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
		domain = email.split('@')[1];
	}
}

function cleanSidCookie() {
	$.ajax({
		method: 'GET',
		cache: false,
		url: './api/auth/clean',
	})
	.done(function(response) {
		//
	})
	.fail(function() {
		//
	})
	.always(function() {
		eraseCookie(sidCookie);
		checkShortId();
	});
}

function setLogo(logoUrl, logoTitle, rounded) {
	var borderRadius = "50%";
	if (!rounded)
		borderRadius = "0";
	$('#logo').attr('src', logoUrl).attr('title', logoTitle).css('border-radius', borderRadius);
	$('<style>.site-wrapper:before{background-image:url('+logoUrl+')}</style>').appendTo('head');
}

function setup() {
	document.title = botName+' | Join Webex Teams Spaces';
	if (supportEmail != '') {
		$('#support').show();
		var supportSubject = 'Question about joining Webex Teams Space via '+botName+' ('+botEmail+')';
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
		eraseCookie(installedCookie);
		$("#emailContainer").hide();
		cleanSidCookie();
	});
	$(window).bind( 'hashchange', function() {
		$("#message").show();
		$('#message').html('');
		$('#input').html('');
		$('#title').html('');
		$('#description').html('');
		setLogo(botAvatar, botName+' ('+botEmail+')', true);
		$('#list').html('');
		checkShortId();
	});
}

$(document).ready(function() {
	setup();
	setEmail();
	checkShortId();
});
